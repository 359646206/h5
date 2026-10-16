
'use strict';

/* ---------------- 基础工具 ---------------- */
function hex2rgb(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function css(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
function cssA(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rand(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------- 一天 24 小时的色彩关键帧 ---------------- */
const KF_RAW = [
  { h: 0,    sky: ['#050816', '#0c1430', '#182447'], mtn: ['#141d3a', '#0e152c', '#080d1d'], cloud: '#253058', glow: '#8fb4ff', star: 1 },
  { h: 4,    sky: ['#060a1e', '#101a3a', '#1e2b52'], mtn: ['#16203f', '#101731', '#0a0f22'], cloud: '#283460', glow: '#9dbcff', star: 1 },
  { h: 4.8,  sky: ['#141a45', '#3a2f66', '#8f4b68'], mtn: ['#242a52', '#1b1f40', '#12142e'], cloud: '#6a4a70', glow: '#c9a0ff', star: 0.55 },
  { h: 6,    sky: ['#2d3f78', '#b5647a', '#ffb36b'], mtn: ['#3a3f6e', '#2c2f55', '#1d1e3c'], cloud: '#ff9d6f', glow: '#ffd9a0', star: 0.08 },
  { h: 7,    sky: ['#4a7bc4', '#8fb4e8', '#ffd9a0'], mtn: ['#5a6ea0', '#42537f', '#2c375f'], cloud: '#ffe3c4', glow: '#fff0d0', star: 0 },
  { h: 9,    sky: ['#4a90d9', '#8ec5f0', '#dcf2ff'], mtn: ['#6b83b5', '#4f6494', '#384a73'], cloud: '#ffffff', glow: '#ffffff', star: 0 },
  { h: 12,   sky: ['#2f7fd9', '#7fc4f5', '#d2f0ff'], mtn: ['#6d8ab8', '#526a9a', '#3a4d78'], cloud: '#ffffff', glow: '#ffffff', star: 0 },
  { h: 15,   sky: ['#3a7cc9', '#8fc0ea', '#ffe3b8'], mtn: ['#66789f', '#4c5c86', '#344265'], cloud: '#ffe9d0', glow: '#fff2cc', star: 0 },
  { h: 17,   sky: ['#44508f', '#e0795f', '#ffb45e'], mtn: ['#4c4272', '#382f56', '#241e3d'], cloud: '#ffb98a', glow: '#ffcf9e', star: 0 },
  { h: 18.2, sky: ['#232a5c', '#9a4a6e', '#ff8c4a'], mtn: ['#3a2f5c', '#2a2144', '#1a1533'], cloud: '#e07a6a', glow: '#ffb37a', star: 0.12 },
  { h: 19.2, sky: ['#101638', '#3a2a58', '#7a3a55'], mtn: ['#262148', '#1b1735', '#110f26'], cloud: '#5a4270', glow: '#c9a0e0', star: 0.5 },
  { h: 20.5, sky: ['#081022', '#131d3d', '#223052'], mtn: ['#182242', '#111831', '#0a0f20'], cloud: '#2e3a64', glow: '#a8c0ff', star: 0.9 },
  { h: 22,   sky: ['#050816', '#0c1430', '#182447'], mtn: ['#141d3a', '#0e152c', '#080d1d'], cloud: '#253058', glow: '#8fb4ff', star: 1 },
  { h: 24,   sky: ['#050816', '#0c1430', '#182447'], mtn: ['#141d3a', '#0e152c', '#080d1d'], cloud: '#253058', glow: '#8fb4ff', star: 1 }
];
const KF = KF_RAW.map(function (k) {
  return {
    h: k.h,
    sky: k.sky.map(hex2rgb),
    mtn: k.mtn.map(hex2rgb),
    cloud: hex2rgb(k.cloud),
    glow: hex2rgb(k.glow),
    star: k.star
  };
});

function getPal(hour) {
  let i = 0;
  while (i < KF.length - 2 && hour >= KF[i + 1].h) i++;
  const a = KF[i], b = KF[i + 1];
  const t = clamp((hour - a.h) / (b.h - a.h || 1), 0, 1);
  return {
    sky: [mix(a.sky[0], b.sky[0], t), mix(a.sky[1], b.sky[1], t), mix(a.sky[2], b.sky[2], t)],
    mtn: [mix(a.mtn[0], b.mtn[0], t), mix(a.mtn[1], b.mtn[1], t), mix(a.mtn[2], b.mtn[2], t)],
    cloud: mix(a.cloud, b.cloud, t),
    glow: mix(a.glow, b.glow, t),
    star: a.star + (b.star - a.star) * t
  };
}

/* ---------------- 画布与场景元素 ---------------- */
const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;

/* ---------------- 素材图片（白天模式，叠加构成基础构图） ----------------
   渲染循环在两张素材就绪（或确认加载失败）后才启动，
   避免首帧用蓝色兜底色填充、素材到位后跳变造成"闪蓝" */
const bgImg = new Image();
const fgImg = new Image();
let bgReady = false, fgReady = false;
let pendingImgs = 2;
function tryStartRender() {
  pendingImgs--;
  if (pendingImgs === 0) requestAnimationFrame(frame);
}
bgImg.onload = function () { bgReady = true; tryStartRender(); };
bgImg.onerror = tryStartRender;
fgImg.onload = function () { fgReady = true; tryStartRender(); };
fgImg.onerror = tryStartRender;
bgImg.src = 'bg.webp';
fgImg.src = 'fg.webp';

/* 等比铺满屏幕（cover），两张图同尺寸同构图，自然对齐 */
function drawCover(g, img, dw0, dh0) {
  const cw = dw0 || W, ch = dh0 || H;
  const s = Math.max(cw / img.width, ch / img.height);
  const dw = img.width * s, dh = img.height * s;
  g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

/* ---------------- 星空与流星 ---------------- */
const rStars = rand(5);
const stars = [];
for (let i = 0; i < 150; i++) {
  stars.push({
    x: rStars(), y: rStars() * 0.6,
    r: 0.4 + rStars() * 1.3,
    sp: 0.5 + rStars() * 2.2, ph: rStars() * 10,
    big: rStars() < 0.06
  });
}

let meteors = [];

/* ---------------- 状态 ---------------- */
let offsetMs = 0;
let demo = false;
let dragging = false;
let lastTs = 0, tAnim = 0;
const DEMO_SPEED = 359; // 1 秒 ≈ 6 分钟

/* ---------------- 绘制 ---------------- */
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/* 前景山体离屏画布：绘制后叠加与背景一致的光影色调，并按山体透明度裁回 */
const fgCv = document.createElement('canvas');
const fctx = fgCv.getContext('2d');
function drawFgTinted(tint) {
  if (!fgReady) return;
  if (fgCv.width !== canvas.width || fgCv.height !== canvas.height) {
    fgCv.width = canvas.width;
    fgCv.height = canvas.height;
  }
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = 'source-over';
  fctx.clearRect(0, 0, fgCv.width, fgCv.height);
  const s = Math.max(fgCv.width / fgImg.width, fgCv.height / fgImg.height);
  const dw = fgImg.width * s, dh = fgImg.height * s;
  const dx = (fgCv.width - dw) / 2, dy = (fgCv.height - dh) / 2;
  fctx.drawImage(fgImg, dx, dy, dw, dh);
  fctx.globalCompositeOperation = 'multiply';
  fctx.fillStyle = css(tint);
  fctx.fillRect(0, 0, fgCv.width, fgCv.height);
  fctx.globalCompositeOperation = 'destination-in';
  fctx.drawImage(fgImg, dx, dy, dw, dh);
  fctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fgCv, 0, 0);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawScene(hour, pal) {
  const t = tAnim;
  ctx.clearRect(0, 0, W, H);

  /* 底色（素材加载前的兜底） */
  ctx.fillStyle = css(pal.sky[0]);
  ctx.fillRect(0, 0, W, H);

  /* 光影随时间变化：白天原色 → 晨昏暖调 → 夜晚深蓝
     夜间压暗深度封顶在 21:30 左右（star≈0.965），后半夜不再继续变深，保证山体始终可辨 */
  const duskW = Math.min(1,
    Math.exp(-Math.pow(hour - 6.1, 2) / 0.9) + Math.exp(-Math.pow(hour - 18.3, 2) / 0.9));
  const nNight = Math.min(pal.star, 0.965);
  const tint = mix(mix([255, 250, 244], [255, 176, 120], duskW * 0.8), pal.sky[0], nNight * 0.94);

  /* 背景天空（素材）+ 整体光影色调 */
  if (bgReady) drawCover(ctx, bgImg);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = css(tint);
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  /* 星空（夜，位于山体之后） */
  if (pal.star > 0.02) {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const a = pal.star * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      if (a < 0.04) continue;
      const x = s.x * W, y = s.y * H;
      ctx.fillStyle = cssA([235, 240, 255], a * 0.95);
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.big && a > 0.35) {
        ctx.strokeStyle = cssA([235, 240, 255], a * 0.45);
        ctx.lineWidth = 1;
        const L = s.r * 5;
        ctx.beginPath();
        ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
        ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
        ctx.stroke();
      }
    }
  }

  /* 流星 */
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    if (m.life <= 0) { meteors.splice(i, 1); continue; }
    const x2 = m.x - m.vx * 0.14, y2 = m.y - m.vy * 0.14;
    const g2 = ctx.createLinearGradient(m.x, m.y, x2, y2);
    g2.addColorStop(0, cssA([255, 255, 255], m.life * pal.star));
    g2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g2;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y); ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /* 前景山体（素材，带同步光影） */
  drawFgTinted(tint);
}

/* ---------------- 更新逻辑 ---------------- */
function updateWorld(pal, dt) {
  /* 流星生成（深夜） */
  if (pal.star > 0.55 && Math.random() < 0.005) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    meteors.push({
      x: W * (0.15 + Math.random() * 0.7),
      y: H * (0.05 + Math.random() * 0.22),
      vx: (260 + Math.random() * 240) * dir,
      vy: 110 + Math.random() * 90,
      life: 1
    });
  }
  for (let i = 0; i < meteors.length; i++) {
    const m = meteors[i];
    m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt * 1.15;
  }
}

/* ---------------- DOM ---------------- */
const elLabel = document.getElementById('scrubLabel');
const slider = document.getElementById('scrub');
const btnNow = document.getElementById('btnNow');
const btnDemo = document.getElementById('btnDemo');
const panel = document.getElementById('panel');
const panelToggle = document.getElementById('panelToggle');
let lastTimeStr = '';

/* 面板开关：入场动画结束后清除 fill-mode 占位，保证显隐过渡生效 */
panel.addEventListener('animationend', function () { panel.style.animation = 'none'; });
panelToggle.addEventListener('click', function () {
  const hidden = panel.classList.toggle('hidden');
  panelToggle.classList.toggle('up', hidden);
  panelToggle.classList.toggle('active', hidden);
  panelToggle.title = hidden ? '显示控制面板' : '隐藏控制面板';
});

function pad(n) { return n < 10 ? '0' + n : '' + n; }

slider.addEventListener('pointerdown', function () { dragging = true; });
window.addEventListener('pointerup', function () { dragging = false; });
slider.addEventListener('input', function () {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  offsetMs = d.getTime() + slider.value * 60000 - Date.now();
});
btnNow.addEventListener('click', function () {
  offsetMs = 0;
});
btnDemo.addEventListener('click', function () {
  demo = !demo;
  btnDemo.classList.toggle('active', demo);
});

/* ---------------- 主循环 ---------------- */
function frame(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.06, (ts - lastTs) / 1000);
  lastTs = ts;
  tAnim += dt;
  if (demo) offsetMs += dt * 1000 * DEMO_SPEED;

  const now = new Date(Date.now() + offsetMs);
  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const pal = getPal(hour);

  updateWorld(pal, dt);
  drawScene(hour, pal);

  const hh = pad(now.getHours()), mm = pad(now.getMinutes());
  const ts2 = hh + ':' + mm;
  if (ts2 !== lastTimeStr) {
    elLabel.textContent = ts2;
    lastTimeStr = ts2;
  }
  if (!dragging) slider.value = now.getHours() * 60 + now.getMinutes();

  requestAnimationFrame(frame);
}
/* 渲染由素材加载完成后的 tryStartRender() 启动 */
