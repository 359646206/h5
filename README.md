# H5 壁纸

| 壁纸 | 页面 URL (`web_page_url`) | ZIP URL (`web_url`) |
| --- | --- | --- |
| 萌宠小猫 | https://359646206.github.io/h5/cat/ | https://359646206.github.io/h5/downloads/cat.zip |
| 时光壁纸 | https://359646206.github.io/h5/time/ | https://359646206.github.io/h5/downloads/time.zip |
| 雪山湖泊 · 时光壁纸 | https://359646206.github.io/h5/time-harmony/ | https://359646206.github.io/h5/downloads/time-harmony.zip |

每个 ZIP 的根目录都是 `index.html`，可下载、解压后离线加载。两份页面保留原有动画和互动，移除了 WorkBuddy 专用的注入脚本，并在页面内禁用长按菜单。

原页面：[萌宠小猫](https://www.workbuddy.link/p/omn71uRlr77BE0I0lWnPTL?source=2)、[时光壁纸](https://www.workbuddy.link/p/FUQSGzGN0aJ4PFYXPFxR4j?source=2)。

雪山湖泊壁纸参考了[新出行的 HarmonyOS 3 时光动态壁纸展示](https://www.xchuxing.com/article/75491?category_id=2)，使用原创写实雪山湖面素材。v3 全程使用 Canvas 2D，无 WebGL 和在线依赖；保留柔和的湖面倒影，以亚像素位移和细小波纹表现微风。雪峰、山谷、天空和水面分别处理晨昏光照，随本地时间平滑过渡，也可用右下角时间轴或“演示”预览。

v3 页面与 ZIP 地址追加 `?v=3`，封面为 `time-harmony/time-harmony-cover-v3.png`（页面白昼的实际 Canvas 画面）。底图 `landscape-v3.webp` 同时内嵌于 HTML，避免 `file://` 加载时 Canvas 读取像素受到跨源限制；ZIP 只需包含 `index.html` 和 `scene-v3.js`。光照图层仅在初始化时计算，动画上限 30 FPS，页面隐藏时停止绘制。旧版封面和底图保留，兼容已缓存的旧页面。
