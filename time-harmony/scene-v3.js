(() => {
  'use strict';
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const slider = document.getElementById('slider');
  const timeLabel = document.getElementById('time');
  const periodLabel = document.getElementById('period');
  const demoButton = document.getElementById('demo');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const blend = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
  const css = color => 'rgb(' + color.map(Math.round).join(',') + ')';
  const realTime = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
  const forced = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('time') || '');
  const validTime = forced && +forced[1] < 24 && +forced[2] < 60;
  let targetMinutes = validTime ? +forced[1] * 60 + +forced[2] : realTime();
  let minutes = targetMinutes, mode = validTime ? 'manual' : 'clock';
  let lastFrame = 0, motion = 0, ready = false;
  let width = 1280, height = 720, shore = 440, terrainTop = 250;
  let terrainLayers = [], waterLayers = [], skyline = [], photo, world, worldCtx, reflection, reflectionCtx;
  let cloudMask, cloudTint, cloudTintCtx, rippleSprite;
  let lastCloudColor = '', lastUiMinute = -1;
  const phases = [
    { at: 0, name: '星夜', top: '#03101f', horizon: '#193443', water: '#0b2432', ambient: [.12,.23,.38], sun: [1,.48,.24], power: 0, line: .34, stars: 1, clouds: .04 },
    { at: 270, name: '拂晓', top: '#101d35', horizon: '#536c81', water: '#294857', ambient: [.19,.32,.52], sun: [1,.51,.28], power: .04, line: .37, stars: .55, clouds: .10 },
    { at: 345, name: '晨曦', top: '#31495f', horizon: '#d6a58e', water: '#607d82', ambient: [.28,.42,.58], sun: [1.3,.80,.08], power: .68, line: .445, stars: .07, clouds: .26 },
    { at: 420, name: '朝阳', top: '#357794', horizon: '#d5d6bd', water: '#4a929a', ambient: [.57,.69,.85], sun: [1.1,.91,.69], power: .37, line: .50, stars: 0, clouds: .22 },
    { at: 570, name: '晴昼', top: '#075693', horizon: '#9cd8df', water: '#247e98', ambient: [.82,.89,.98], sun: [1,.99,.95], power: .18, line: .65, stars: 0, clouds: .27 },
    { at: 780, name: '晴昼', top: '#064c89', horizon: '#8bd8df', water: '#147d96', ambient: [.83,.90,1.0], sun: [1,1,.98], power: .16, line: .65, stars: 0, clouds: .20 },
    { at: 960, name: '斜阳', top: '#3f7186', horizon: '#ead1b6', water: '#759897', ambient: [.63,.74,.93], sun: [1.15,.88,.65], power: .32, line: .53, stars: 0, clouds: .26 },
    { at: 1050, name: '夕照', top: '#425e74', horizon: '#efb6a5', water: '#819196', ambient: [.34,.49,.66], sun: [1.3,.75,.06], power: .62, line: .48, stars: 0, clouds: .35 },
    { at: 1125, name: '暮色', top: '#182b47', horizon: '#9c7c87', water: '#46576b', ambient: [.21,.34,.57], sun: [1.1,.42,.29], power: .36, line: .395, stars: .16, clouds: .22 },
    { at: 1215, name: '入夜', top: '#081a2c', horizon: '#304757', water: '#203d4a', ambient: [.14,.26,.44], sun: [1,.45,.25], power: 0, line: .34, stars: .65, clouds: .08 },
    { at: 1350, name: '星夜', top: '#03101f', horizon: '#193443', water: '#0b2432', ambient: [.12,.23,.38], sun: [1,.48,.24], power: 0, line: .34, stars: 1, clouds: .04 },
    { at: 1440, name: '星夜', top: '#03101f', horizon: '#193443', water: '#0b2432', ambient: [.12,.23,.38], sun: [1,.48,.24], power: 0, line: .34, stars: 1, clouds: .04 }
  ].map(p => ({ ...p, top: rgb(p.top), horizon: rgb(p.horizon), water: rgb(p.water) }));

  function makeCanvas(w, h) {
    const result = document.createElement('canvas');
    result.width = w; result.height = h;
    return result;
  }
  function random(seed) {
    let value = seed >>> 0;
    return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  }
  const rand = random(4186);
  const stars = Array.from({ length: 145 }, () => ({ x: rand(), y: rand() * .55, size: .35 + rand() * .65, phase: rand() * 6.28 }));
  const ripples = Array.from({ length: 150 }, () => ({ x: rand(), depth: rand(), length: .3 + rand() * .7, phase: rand() * 6.28, speed: .12 + rand() * .16 }));

  function currentPalette() {
    const value = (minutes + 1440) % 1440;
    let i = 0;
    while (i < phases.length - 2 && value >= phases[i + 1].at) i++;
    const a = phases[i], b = phases[i + 1];
    let t = clamp((value - a.at) / (b.at - a.at));
    t = t * t * (3 - 2 * t);
    return { i, t, name: t < .5 ? a.name : b.name, top: blend(a.top,b.top,t), horizon: blend(a.horizon,b.horizon,t), water: blend(a.water,b.water,t), stars: mix(a.stars,b.stars,t), clouds: mix(a.clouds,b.clouds,t) };
  }

  // The sky in the source is smooth blue. Trace its first edge once, so clouds
  // and stars are always behind the mountains and snow keeps its own lighting.
  function buildTerrain(source) {
    const pixels = source.getContext('2d').getImageData(0, 0, width, height);
    const data = pixels.data;
    const edges = [];
    for (let x = 0; x < width; x++) {
      let edge = Math.floor(height * .56);
      for (let y = Math.floor(height * .30); y < height * .56; y++) {
        const n = (y * width + x) * 4, above = n - width * 8;
        const r = data[n], g = data[n + 1], b = data[n + 2];
        const blueSky = b > 150 && b - r > 27 && g - r > 22 && b - g > 12;
        if (!blueSky || data[above + 2] - b > 25 || r - data[above] > 32) { edge = y; break; }
      }
      edges.push(edge);
    }
    skyline = edges.map((edge, x) => {
      const neighborhood = edges.slice(Math.max(0, x - 1), Math.min(width, x + 2)).sort((a,b) => a-b);
      return neighborhood[Math.floor(neighborhood.length / 2)];
    });
    terrainTop = Math.max(0, Math.min(...skyline) - 2);
    const bandHeight = shore + 2 - terrainTop;
    terrainLayers = phases.slice(0, -1).map(phase => {
      const layer = makeCanvas(width, bandHeight);
      const layerCtx = layer.getContext('2d');
      const output = layerCtx.createImageData(width, bandHeight);
      for (let y = terrainTop; y < shore + 2; y++) {
        const light = clamp((phase.line - y / height) / .06);
        const litHeight = light * light * (3 - 2 * light);
        for (let x = 0; x < width; x++) {
          const n = (y * width + x) * 4, out = ((y - terrainTop) * width + x) * 4;
          const alpha = clamp(y - skyline[x] + .5);
          if (!alpha) continue;
          const r = data[n] / 255, g = data[n + 1] / 255, b = data[n + 2] / 255;
          const luminance = r * .2126 + g * .7152 + b * .0722;
          const facet = Math.pow(luminance, 1.7) * litHeight * phase.power;
          output.data[out] = clamp(r * phase.ambient[0] + facet * phase.sun[0]) * 255;
          output.data[out + 1] = clamp(g * phase.ambient[1] + facet * phase.sun[1]) * 255;
          output.data[out + 2] = clamp(b * phase.ambient[2] + facet * phase.sun[2]) * 255;
          output.data[out + 3] = alpha * 255;
        }
      }
      layerCtx.putImageData(output, 0, 0);
      return layer;
    });
    terrainLayers.push(terrainLayers[0]);
    // Keep the photograph's soft vertical reflection, relit with the same
    // elevation and sun color as the peaks. All pixel work is cached once.
    waterLayers = phases.slice(0, -1).map(phase => {
      const layer = makeCanvas(width, height - shore);
      const layerCtx = layer.getContext('2d');
      const output = layerCtx.createImageData(width, height - shore);
      for (let y = shore; y < height; y++) {
        const depth = (y - shore) / (height - shore);
        const mirrorY = shore / height - (y - shore) / height / .90;
        const light = clamp((phase.line - mirrorY) / .06);
        const litHeight = light * light * (3 - 2 * light);
        const skyAmount = .30 + depth * .16;
        for (let x = 0; x < width; x++) {
          const n = (y * width + x) * 4, out = ((y - shore) * width + x) * 4;
          const r = data[n] / 255, g = data[n + 1] / 255, b = data[n + 2] / 255;
          const luminance = r * .2126 + g * .7152 + b * .0722;
          const facet = Math.pow(luminance, 2.4) * litHeight * phase.power * .7;
          for (let c = 0; c < 3; c++) {
            const lit = data[n + c] / 255 * phase.ambient[c] + facet * phase.sun[c];
            output.data[out + c] = clamp(mix(lit, phase.water[c] / 255 * (1 - depth * .4), skyAmount)) * 255;
          }
          output.data[out + 3] = 255;
        }
      }
      layerCtx.putImageData(output, 0, 0);
      return layer;
    });
    waterLayers.push(waterLayers[0]);
  }

  function buildClouds() {
    cloudMask = makeCanvas(512, 128);
    const c = cloudMask.getContext('2d');
    const noiseRand = random(725);
    const grids = [8,16,32,64].map(size => ({size, values: Array.from({length:(size+1)*(size+1)},noiseRand)}));
    const noise = (x,y,grid) => {
      const px=x*grid.size, py=y*grid.size, ix=Math.floor(px), iy=Math.floor(py);
      const tx=px-ix, ty=py-iy, sx=tx*tx*(3-2*tx), sy=ty*ty*(3-2*ty), stride=grid.size+1;
      return mix(mix(grid.values[iy*stride+ix],grid.values[iy*stride+ix+1],sx),mix(grid.values[(iy+1)*stride+ix],grid.values[(iy+1)*stride+ix+1],sx),sy);
    };
    const pixels = c.createImageData(512,128);
    for(let y=0;y<128;y++) for(let x=0;x<512;x++) {
      const nx=x/512, ny=y/128;
      const n=noise(nx,ny,grids[0])*.52+noise(nx,ny,grids[1])*.27+noise(nx,ny,grids[2])*.14+noise(nx,ny,grids[3])*.07;
      const envelope=Math.pow(Math.sin(nx*Math.PI),.6)*Math.pow(Math.sin(ny*Math.PI),1.5);
      const alpha=clamp((n-.43)*3)*envelope;
      const at=(y*512+x)*4;
      pixels.data[at]=pixels.data[at+1]=pixels.data[at+2]=255;
      pixels.data[at+3]=alpha*255;
    }
    c.putImageData(pixels,0,0);
    cloudTint=makeCanvas(512,128); cloudTintCtx=cloudTint.getContext('2d');
    rippleSprite=makeCanvas(96,8);
    const r=rippleSprite.getContext('2d');
    const glow=r.createRadialGradient(48,4,0,48,4,48);
    glow.addColorStop(0,'rgba(235,249,255,.6)'); glow.addColorStop(1,'rgba(235,249,255,0)');
    r.scale(1,.06); r.fillStyle=glow; r.fillRect(0,0,96,128);
  }

  function drawSky(p) {
    const sky = worldCtx.createLinearGradient(0,0,0,shore);
    sky.addColorStop(0,css(p.top));
    sky.addColorStop(.63,css(blend(p.top,p.horizon,.44)));
    sky.addColorStop(1,css(p.horizon));
    worldCtx.fillStyle=sky; worldCtx.fillRect(0,0,width,shore+2);
    if(p.stars>.01) {
      worldCtx.fillStyle='#e5f0ff';
      stars.forEach(star => {
        worldCtx.globalAlpha=p.stars*(.42+.16*Math.sin(motion*.22+star.phase));
        worldCtx.beginPath(); worldCtx.arc(star.x*width,star.y*height,star.size,0,Math.PI*2); worldCtx.fill();
      });
      worldCtx.globalAlpha=1;
    }
    const cloudColor=css(blend(p.horizon,[255,244,233],.45));
    if(cloudColor!==lastCloudColor) {
      cloudTintCtx.clearRect(0,0,512,128);
      cloudTintCtx.globalCompositeOperation='source-over';
      cloudTintCtx.drawImage(cloudMask,0,0);
      cloudTintCtx.globalCompositeOperation='source-in';
      cloudTintCtx.fillStyle=cloudColor; cloudTintCtx.fillRect(0,0,512,128);
      cloudTintCtx.globalCompositeOperation='source-over';
      lastCloudColor=cloudColor;
    }
    worldCtx.globalAlpha=p.clouds;
    const drift=motion*.45;
    for(let i=-1;i<3;i++) worldCtx.drawImage(cloudTint,i*width*.7+(drift%(width*.7))-width*.15,height*.16+(i%2)*height*.07,width*.65,height*.10);
    worldCtx.globalAlpha=1;
  }

  function drawWater(p) {
    const lakeHeight=height-shore;
    reflectionCtx.drawImage(waterLayers[p.i],0,0);
    reflectionCtx.globalAlpha=p.t;
    reflectionCtx.drawImage(waterLayers[p.i+1],0,0);
    reflectionCtx.globalAlpha=1;
    worldCtx.drawImage(reflection,0,shore);
    // Subpixel refraction is confined to the reflection. The shoreline stays fixed.
    // Wind ripples move slowly; amplitude is < 1 source pixel, with no hard bands.
    for(let y=0;y<lakeHeight;y+=2) {
      const depth=y/lakeHeight;
      const strength=clamp(y/12)*(.08+depth*.42);
      const displacement=(Math.sin(y*.105+motion*.48)+Math.sin(y*.043-motion*.31)*.45)*strength;
      const vertical=Math.sin(y*.082+motion*.36)*strength*.24;
      const bandHeight=Math.min(2,lakeHeight-y);
      worldCtx.drawImage(reflection,0,clamp(y+vertical,0,lakeHeight-bandHeight),width,bandHeight,displacement,shore+y,width,bandHeight);
    }
    ripples.forEach(ripple => {
      const depth=.04+ripple.depth*.94;
      const y=shore+lakeHeight*depth+Math.sin(motion*ripple.speed+ripple.phase)*.18;
      const x=ripple.x*width+Math.sin(motion*.12+ripple.phase)*.7;
      const breath=.5+.5*Math.sin(motion*.55+ripple.phase);
      worldCtx.globalAlpha=(.016+.022*breath)*(1-p.stars*.65)*Math.sqrt(depth);
      worldCtx.drawImage(rippleSprite,x,y,18+ripple.length*75*depth,.6+depth*.65);
    });
    worldCtx.globalAlpha=1;
  }

  function resize() {
    const ratio=Math.min(devicePixelRatio||1,1.25,Math.sqrt(1600000/(innerWidth*innerHeight)));
    canvas.width=Math.round(innerWidth*ratio); canvas.height=Math.round(innerHeight*ratio);
  }
  function render() {
    if(!ready) return;
    const p=currentPalette();
    drawSky(p);
    worldCtx.drawImage(terrainLayers[p.i],0,terrainTop);
    worldCtx.globalAlpha=p.t;
    worldCtx.drawImage(terrainLayers[p.i+1],0,terrainTop);
    worldCtx.globalAlpha=1;
    drawWater(p);
    const scale=Math.max(canvas.width/width,canvas.height/height);
    ctx.drawImage(world,(canvas.width-width*scale)/2,(canvas.height-height*scale)/2,width*scale,height*scale);
    const m=Math.floor((minutes+1440)%1440);
    if(m!==lastUiMinute) {
      timeLabel.textContent=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
      periodLabel.textContent=p.name;
      if(document.activeElement!==slider) slider.value=m;
      lastUiMinute=m;
    }
  }
  function frame(time) {
    if(document.hidden) { lastFrame=time; requestAnimationFrame(frame); return; }
    if(time-lastFrame>=1000/30) {
      const delta=Math.min((time-lastFrame)/1000,.1); lastFrame=time;
      if(!reducedMotion) motion+=delta;
      if(mode==='clock') targetMinutes=realTime();
      if(mode==='demo') { targetMinutes=(targetMinutes+delta*16)%1440; minutes=targetMinutes; }
      else {
        let difference=targetMinutes-minutes;
        if(difference>720) difference-=1440;
        if(difference<-720) difference+=1440;
        minutes=(minutes+difference*Math.min(1,delta*7)+1440)%1440;
      }
      render();
    }
    requestAnimationFrame(frame);
  }
  slider.addEventListener('input',()=>{mode='manual';targetMinutes=+slider.value;demoButton.textContent='演示';demoButton.setAttribute('aria-pressed','false');});
  document.getElementById('now').addEventListener('click',()=>{mode='clock';targetMinutes=realTime();demoButton.textContent='演示';demoButton.setAttribute('aria-pressed','false');});
  demoButton.addEventListener('click',()=>{
    mode=mode==='demo'?'manual':'demo';
    targetMinutes=minutes;
    demoButton.textContent=mode==='demo'?'暂停':'演示';
    demoButton.setAttribute('aria-pressed',String(mode==='demo'));
  });
  document.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('selectstart',event=>event.preventDefault());
  addEventListener('resize',()=>{resize();render();});
  resize();
  photo=document.getElementById('landscape');
  function initialize() {
    height=Math.round(width*photo.naturalHeight/photo.naturalWidth); shore=Math.round(height*.611);
    const source=makeCanvas(width,height);
    source.getContext('2d').drawImage(photo,0,0,width,height);
    world=makeCanvas(width,height); worldCtx=world.getContext('2d',{alpha:false});
    reflection=makeCanvas(width,height-shore); reflectionCtx=reflection.getContext('2d');
    buildTerrain(source); buildClouds();
    ready=true; render(); canvas.style.opacity='1';
    requestAnimationFrame(frame);
  }
  // Embedded pixels also work under file:// without canvas origin permissions.
  if(photo.complete && photo.naturalWidth) initialize();
  else photo.onload=initialize;
})();

