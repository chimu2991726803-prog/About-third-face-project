# BLINK & STITCH · 眨眼缝一张脸

这是一个真正可以运行的 HTML + CSS + JavaScript + **MediaPipe Face Landmarker** 交互原型。
它延续毛毡、布娃娃、缝线的视觉风格，把旧版的手势抓取改成了「眨眼捕捉自由落下的五官」。

## 现在具备的功能

- 第一轮：眼睛 × 2；第二轮：鼻子 × 1；第三轮：嘴巴 × 1；第四轮：眉毛 × 2。
- 每轮只有对应种类的五官从上方自由落下，拥有不同颜色与形状。
- **五官可以固定在娃娃脸上任意位置**，包括嘴巴落在额头、眼睛落在鼻子附近；没有五官槽位限制。
- MediaPipe 检测到眨眼时，每次只抓住当前与布娃娃脸部重叠、最靠近脸中央的一枚五官。
- 每轮完成后，保留已安装五官并自动进入下一轮。
- 完成后进入「表情模式」，安装的眼睛响应用户左右眼眨眼，嘴巴响应张嘴/微笑，眉毛响应抬眉，鼻子有轻微动作。**位置不影响功能**。
- 无摄像头时，按空格或点击「模拟眨眼」能测试全部轮次及表情。
- 摄像头权限先于 MediaPipe 网络加载申请，避免旧版无法弹出相机权限的问题。
- 界面显示相机及模型状态；如果模型下载失败，网页和手动模式仍可用。

## 文件

```
blink-stitch-prototype/
├── index.html               网页结构
├── style.css                手工毛毡效果、布局、动画
├── script.js                下落、轮次、MediaPipe、表情动画
├── start-mac.command        macOS 本地服务器快捷脚本
├── start-windows.bat        Windows 本地服务器快捷脚本
├── models/
│   └── README.txt           可选本地人脸模型存放位置
└── scripts/
    └── download_model.py    可选：将模型下载到本地
```

## 最简单启动方法（无需 npm）

请用 VS Code / Codex 打开整个文件夹，终端运行：

```bash
python3 -m http.server 8000
```

在 Chrome 中打开：

```
http://localhost:8000
```

**不要直接双击 `index.html`，也尽量不要用 VS Code 内置网页预览。** 摄像头需要 localhost 或 HTTPS 的安全上下文。按 Ctrl+C 停止服务器。

第一次打开网页可以先直接用「模拟眨眼」按钮或空格测试。想使用真实眨眼，点击右上角「启动摄像头」，先允许使用相机，接下来才会开始加载 MediaPipe。

### MediaPipe 如何工作

- JS 库：`@mediapipe/tasks-vision` 固定版本 `1.1.1`，网页动态从 jsDelivr 加载。
- WASM：同版本 jsDelivr。
- `.task` 模型：优先加载本地 `models/face_landmarker.task`，如果不存在，则从 Google 官方模型链接加载。
- MediaPipe 用 `outputFaceBlendshapes: true` 返回 `eyeBlinkLeft / eyeBlinkRight / jawOpen / mouthSmileLeft / mouthSmileRight / browInnerUp` 等表情系数。
- **这版不需要 Gesture Recognizer**，因为交互已经从「捏合」改为「眨眼」。

首次用真实摄像头时必须能够访问 jsDelivr，且在未下载本地模型时需要能访问 `storage.googleapis.com`。加载失败时先检查 Chrome 开发者工具 Console、网络及权限。

**可选：提前将官方模型保存到项目中**（网络正常时执行一次）：

```bash
python3 scripts/download_model.py
```

它保存到 `models/face_landmarker.task`，避免每次从 Google 下载模型；但 JS/WASM 仍通过 jsDelivr 加载。此项目并非完全离线版本。

## 从哪里改

在 `script.js` 中修改 `ROUNDS` 就能增减轮次，例如：

```js
const ROUNDS = [
  { type: 'eye', goal: 2, ... },
  { type: 'nose', goal: 1, ... },
  // ...
];
```

所有脸部捕捉位置由 `insideFace(part)` 的椭圆命中检测决定，**没有** eyeSlot / mouthSlot 这类固定位置。

眨眼灵敏度在 `analyzeFrame()` 调整：

```js
filteredBlink > .58   // 闭眼触发
filteredBlink < .26   // 睁眼复位
```

下落速度在 `createPart()` 的 `fallSpeed:rand(95,135)` / `gravity:rand(14,28)` 修改，生成频率在 `renderFrame()` 的 `spawnClock>.9` 修改。

所有装上去的五官依然是独立 DOM 元素，表达式只依赖 `type`，不依赖 x/y 位置。可以把它们替换为 PNG / WebP 美术素材，原本的捕捉逻辑不需要大改。

## 当前原型的边界

- 当前只做 **眨眼捕捉 + 轮次 + 表情同步**，**没有**接入 Pose 人体动作操控娃娃四肢；这是有意将开发范围控制在当前 B 阶段。
- 本版角色是 CSS 绘制的布娃娃，表情驱动为 2D CSS 变形，而不是 3D 骨骼绑定。
- 摄像头/模型需要在你自己的浏览器验证；无法提前替你同意摄像头权限。
- 如果本机 Face Landmarker 检测不到眨眼，请确认整张脸清晰可见、光线充足，调整阈值或换用手动测试。
- 对于精致的独立左/右眼表情，已安装的首个眼睛绑定真实左眼、第二个绑定真实右眼，即使它们在脸上处于错位位置也不影响。
