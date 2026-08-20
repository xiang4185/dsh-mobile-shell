# iOS Stable Baseline — 1.1.1

> **维护前必读。** 这份文档记录 `dsh-mobile-shell` iOS 当前 Stable、已经锁定的架构约束、历史根因和回归检查。
>
> 修改 iOS 端之前先读本文件；如果只是改某一个 UI/功能，不要顺手重构这里已经验证稳定的链路。

## 1. 当前冻结基线

- 项目版本：`1.1.1`
- 主分支：`fork-main`
- 当前 Stable tag：`v1.1.1`
- 1.1.0 原始运行代码回退锚点：`f2dde4d` — `polish-ios: remove final control chrome`
- 状态：2026-08-20 rc.8 Compatibility Layer + 真机收口完成
- 封版审计：[`docs/RELEASE-1.1.1-AUDIT.md`](docs/RELEASE-1.1.1-AUDIT.md)
- 已知未解决项统一记录在 [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md)，不要用临时补丁掩盖。

如果后续出现“以前明明正常，现在突然坏了”的问题，第一件事不是继续补 CSS/JS，而是：

```bash
git diff f2dde4d..HEAD -- app/ios app/capacitor.config.ts scripts/verify-ios-embedded-js.mjs
```

先确认稳定基线之后到底改了什么。

---

## 2. 项目边界：iOS 是壳，不是重写 DSH

App 的原则一直是：

```text
iOS Native Shell
  └─ WKWebView
      └─ 主机实际提供的原版 DSH Web
```

- DSH 的 Workspace、Session、模型、权限、Settings、工具链等仍由官方 Web UI 提供。
- iOS 只负责配对、原生 viewport、Loading、移动端布局/手势和必要的 DOM 适配。
- 不要为了修移动端问题复制或伪造一套 DSH 功能 UI。
- iOS 修复不要顺带修改 Android。
- DSH 上游升级要作为单独任务做兼容验证，不要与 Stable 小修混在一个提交里。

---

## 3. 启动/Root Controller 架构：不要改回 Storyboard 驱动

当前正确链路：

```text
SceneDelegate
  └─ DSHKeyboardViewportViewController
      └─ DSHBridgeViewController
          └─ CAPBridgeViewController / WKWebView
```

关键事实：

- `Info.plist` 使用 `UIApplicationSceneManifest` 指向 `SceneDelegate`。
- 没有 `UIMainStoryboardFile` 作为启动入口。
- `Main.storyboard` 目前仍被 Xcode 打包，但不是当前 Root Controller 的权威来源。
- `SceneDelegate` 明确创建 `DSHKeyboardViewportViewController()`。

### 历史事故

曾经因为 Storyboard 实例化了普通 `CAPBridgeViewController`，导致自定义 `DSHBridgeViewController` 根本没有运行，最终表现为“突然又变回桌面网页版 / 移动注入全失效”。

因此：**不要因为 Main.storyboard 还存在，就把启动链切回 Storyboard。** 如果必须动 bootstrap，必须先证明当前 Root Controller 链本身就是问题来源。

---

## 4. 键盘：永远保持 Single Native Driver

这是本项目最重要的稳定约束。

### 唯一驱动

键盘只由 UIKit 的 `keyboardLayoutGuide` 驱动 WebView 高度：

```swift
if #available(iOS 17.0, *) {
    view.keyboardLayoutGuide.usesBottomSafeArea = false
}

bridgeView.topAnchor = view.topAnchor
bridgeView.leadingAnchor = view.leadingAnchor
bridgeView.trailingAnchor = view.trailingAnchor
bridgeView.bottomAnchor = view.keyboardLayoutGuide.topAnchor
```

Capacitor：

```ts
Keyboard: {
  resize: 'none',
  autoBackdropColor: 'dom',
}
```

### 禁止重新引入

不要再出现第二个键盘驱动：

- `visualViewport` 键盘补偿
- `Keyboard.setResizeMode({ mode: 'native' })`
- `UIKeyboardWillChangeFrame` / keyboard frame → JS
- JS 主动修改聊天 root 的 `top / height / transform`
- `scrollIntoView()` 作为键盘修复
- `setTimeout` / delayed rAF 的键盘滚动补偿
- CSS `keyboard-height` 动画
- 键盘弹完以后再做第二阶段 scroll 修正

这些方案以前都造成过“键盘先跳、消息再跳”“页面来回修正”的明显体验问题。

### 阅读位置保持

消息列表只通过自己的 `ResizeObserver` 感知 viewport 尺寸变化，不监听键盘。

当前逻辑是：

```text
previousHeight - nextHeight = heightDelta
desiredTop = oldAnchorTop - heightDelta
```

因此键盘上升多少，正在阅读的内容同步上移多少；键盘下降时反向恢复。

职责必须继续分离：

```text
keyboardLayoutGuide 只负责 viewport geometry
message scroller     只负责 reading anchor
```

### Post-Stable 已确认的手机输入交互

`dsh-upgrade/compat-layer` 后续真机验收又固定了一条手机端交互规则：**用户点进 Composer 准备输入时，不再保留历史中间阅读位置，而是直接回到最新消息并保持 bottom pinned。**

实现边界仍不变：输入框的 pointer/focus 只表达“回到底部”的用户意图，消息列表仍由自己的 `ResizeObserver` 维持 bottom pin；不得因此新增 keyboard event、`visualViewport`、键盘高度 JS、`scrollIntoView()` 或第二套 viewport resize。

**当前已知遗留：发送成功后软件键盘不会自动收起。** `textarea.blur()` 与原生 `view.endEditing(true)` 两条实验路径都未在真机解决，因此封版代码已移除这些无效 workaround。后续调查见 [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md)。

---

## 5. 键盘历史根因：Auto Layout 冲突也会把 viewport 搞坏

曾经第一处真机回归发生在：

```text
2c89282  GOOD
7bbc507  BAD
```

`7bbc507` 给 Loading 大图加了：

```swift
heroImageView.setContentCompressionResistancePriority(.required, for: .horizontal)
heroImageView.setContentCompressionResistancePriority(.required, for: .vertical)
```

同时又有 Required 的较小尺寸上限，造成同一个 Controller 内 Auto Layout 冲突。键盘 `keyboardLayoutGuide` 收缩时，整个布局求解被污染，于是表面看起来像“键盘代码坏了”。

真机隔离验证：

- `a68cf29`：只删除两行 `.required` → 问题消失
- `69ca713`：正式修复 `remove loading image compression resistance`

### 结论

排查键盘时，不只搜 keyboard 代码；还要检查**同一个 ViewController 中是否新增 Required constraint / compression resistance / hugging 冲突**。

Loading 图片不要重新加 `.required` compression resistance。

---

## 6. 启动恢复：不能闪键盘，也不能闪“新会话”

稳定启动目标：

```text
冷启动
→ Loading
→ 连接主机
→ 恢复 Session
→ 最近会话稳定
→ 直接 reveal
```

禁止回到：

```text
Loading
→ 新会话
→ 最近会话
```

当前已经锁定：

- `1598d94`：启动阶段阻止脚本自动 focus，避免冷启动键盘闪一下再收回。
- `2633421`：Session 恢复稳定后才 reveal，不靠固定 300/500ms 延迟。
- Loading connection-start 动画是幂等的，重复连接 signal 不应该让动画重新从左边开始。

如果启动键盘又闪：优先找 `autofocus`、`.focus()`、React effect、Session 恢复后的 composer focus；**不要用“先弹出来再 blur/resign”掩盖。**

---

## 7. Settings：这里最重要的是 Portal 层级

DSH 的 General Settings 下拉不是原生 `<select>`，而是自定义按钮：

```text
button + aria-haspopup="menu"
```

点击后菜单通过 React portal 挂到 `BODY`：

```text
Settings overlay/sidebar  z-index = 1000
BODY popup menu            z-index = 1100
```

这是官方原有的 stacking contract。

### 已确认根因

此前 iOS 曾把 Settings/sidebar 抬到 `19990 / 20000`，结果按钮点击其实成功、menu 也创建成功，但 body portal 的 `1100` 被整个 Settings stacking context 压在下面，看起来就像“下拉完全点不了”。

正式修复：

- `82f55b7` — `restore settings portal stacking order`

### 维护规则

- Settings/sidebar 保持在 `1000` 这一档。
- DSH body portal 保持能以 `1100` 出现在它上方。
- 不要再用 `20000+` 解决 Settings 层级。
- 不要把 `.VOzbGW_overlay` re-parent 到 body；历史上这样会破坏 React unmount，导致下拉/关闭冻结。
- 不要用全局 `pointer-events:auto !important` 轰炸 Settings descendants。

### 当前移动端 Settings 视觉约定

- 进入 Settings 后隐藏聊天页左上/右上的 Native Chrome。
- 左上只保留 iOS 返回按钮。
- 官方右上 `X` 和其 `.VOzbGW_header` 行已隐藏。
- 顶部分类使用轻量横向导航 + 当前项底部细线，不是大胶囊 Tab。
- “当前主机”只显示在「通用设置」底部；模型/插件/Agent 页面不显示。
- 重新配对仍需要二次确认。

---

## 8. Drawer：区分“本地操作”和“真正导航”

当前抽屉层级：

```text
新会话                 主操作
工作区 + 搜索          高频工具
视图与排序 / 添加工作区  二级管理
Workspace / Session    内容
设置                   底部长条入口
```

### 点击规则

应该关闭 Drawer：

- 打开 Session
- 切换 Workspace
- 新建会话
- 明确导航到主内容

不应该关闭 Drawer：

- 搜索
- 视图/分组/排序
- 展开更多 Session
- 展开/收起 Workspace
- popup/menu trigger
- 筛选/管理类局部操作

Drawer 本身保持 `z-index: 1000`，DSH body portal menu `1100`，否则 Workspace/Session 更多菜单又会被压住。

`.qDHVXG_fade` 已在 iOS 隐藏；它曾在列表底部形成一块明显白色渐变/矩形，不要恢复。

---

## 9. Composer：视觉圆角和真实 Hitbox 要分开

真机曾出现：按钮和输入框“点一下没反应，多点几次才行”。

实际 hit-test 发现，部分 40–44pt 控件虽然视觉很大，但真实按钮有大圆角，WebKit 在四角命中了父容器而不是按钮。

当前约定：

- 高频目标至少约 `44pt`。
- 真正接收点击的按钮尽量保持矩形 hitbox。
- 圆形/胶囊外观用内层或 `::before` 绘制，不要靠缩小真实点击区域获得视觉圆角。
- textarea 的圆角由 Composer card 表达；输入 textarea 本体保持可靠 hitbox。
- `+` 和发送按钮保留蓝色圆形视觉。
- 权限按钮不再显示额外圆圈，但 **44pt 隐形点击区必须保留**。
- 模型选择保留胶囊视觉。

不要为了“看起来更圆”重新把 hit target 改回小圆形。

---

## 10. Loading：原生层不要污染键盘布局

Loading 是 Native 层，不应该通过 WebView JS 动画实现复杂逻辑。

当前规则：

- Native Loading 跟随当前 viewport。
- 小鲸鱼/进度轨道是 indeterminate 状态，不伪造百分比。
- 重复 `dshConnectionStarting` 不重启动画。
- Loading 结束后动画停止。
- `Reduce Motion` 下不做持续横向运动。
- 不给 Loading UIImageView 增加 `.required` compression resistance。

---

## 11. 三段 Embedded JS 是运行时代码，Swift 编译绿不代表它们没坏

`SceneDelegate.swift` 内有三段关键 JavaScript：

```text
viewportBootstrap
mobileLayoutBootstrap
mobileThemeBootstrap
```

曾经 `46e966f` 少了一个 `}`，但 Swift/Xcode 仍然能编译，因为 JavaScript 对 Swift 只是字符串。

所以现在 CI 必须执行：

```bash
node scripts/verify-ios-embedded-js.mjs
```

该脚本会提取三段 JS 并逐个 `node --check`。

### 不允许绕过

如果改了 `SceneDelegate.swift` 中的嵌入 JS/CSS，提交前至少跑：

```bash
node scripts/verify-ios-embedded-js.mjs
npm --prefix app run typecheck
```

---

## 12. DSH 私有 CSS Modules 是维护债，不要继续扩散

当前移动层仍然引用一些上游私有 class，例如：

```text
.VOzbGW_*
.hHd-Xa_*
.qDHVXG_*
.uV2eYG_*
.wSkVaW_*
```

这些 class 未来 DSH 升级时可能变化。

现阶段 Stable 不重构它们，但新增适配时优先级应该是：

```text
稳定 data-* / aria / role
→ 结构语义
→ 私有 CSS Module class（最后兜底）
```

不要在新的业务逻辑里到处散落更多私有 selector。后续单独建设 DSH Compatibility Layer，把 selector/capability 集中管理。

---

## 13. 每次 iOS 修改的最小回归 Gate

### 静态检查

```bash
git diff --check
npm --prefix app run typecheck
node scripts/verify-ios-embedded-js.mjs
node scripts/verify-launcher.mjs
node scripts/verify-pairing-qr.mjs
npm run verify:version
npm run package:web
npm run verify:web
```

GitHub `build-ios` 必须全绿：

- iOS Simulator build
- iOS Device unsigned build
- IPA package
- Embedded JS syntax verification

### 真机 Gate（涉及对应区域时必须测）

启动：

- 冷启动多次不闪键盘
- 不出现“新会话 → 最近会话”闪跳
- Loading 连续，不突然重置

键盘：

- 中文系统输入法
- 第三方输入法（如果安装）
- 连续开关至少 10 次
- 交互式下滑
- 从历史中间位置点 Composer 时立即回到最新消息
- 键盘弹出/收起期间保持 bottom pinned，不出现二段跳
- 发送成功后键盘当前仍保持打开：这是已记录 Known Issue，不得为了封版临时加第二套键盘补偿

Settings：

- Agent 预设下拉
- 权限下拉
- 语言下拉
- Enter 行为下拉
- 切换顶部分类
- 返回
- 当前主机只在通用页
- 重新配对取消/确认

Drawer：

- Session 点击后关闭
- Workspace 切换
- 搜索
- 视图与排序不误关 Drawer
- 展开更多
- Workspace/Session 更多菜单位于 Drawer 上方
- 滑动开关 Drawer
- 底部 Settings

Composer：

- 输入框中心/边缘都能一次聚焦
- `+` / 权限 / 模型 / 发送都能一次命中
- 视觉样式变化不能牺牲 44pt hitbox

---

## 14. 出现回归时的排障顺序

不要一上来同时改 CSS、JS、Swift。按以下顺序：

1. **确认 Stable 差异**
   ```bash
   git diff f2dde4d..HEAD -- app/ios app/capacitor.config.ts
   ```
2. **先判断是哪一层**
   - Bootstrap / Root Controller
   - Native keyboard viewport
   - Web DOM/selector
   - Settings/body portal stacking
   - Drawer interaction
   - Composer hit-test
   - Auto Layout 间接冲突
3. **用真实 DOM/实际 hit-test 取证**，不要根据截图猜 class。
4. **一次只验证一个假设**，做最小 diff。
5. **单独提交**，真机验证后再进入下一项。
6. 如果理论与真机冲突，**真机结果优先**。

### 特别提醒

以下“看起来像万能修复”的做法，在本项目里通常意味着风险：

- 随手抬到 `z-index: 20000+`
- 全局 `pointer-events:auto !important`
- re-parent React DOM
- keyboard event + JS scroll compensation
- 固定延时 300/500ms 掩盖异步状态
- 为了点击面积把视觉圆圈直接做成真实 hitbox
- 为了 Loading 布局稳定添加 Required Auto Layout priority

---

## 15. 关键历史锚点

这些 commit 是以后 bisect/理解根因的重要参照：

| Commit | 含义 |
|---|---|
| `72bb9f5` | 键盘 Single Native Viewport Driver 基线 |
| `7bbc507` | 首次引入 Loading Auto Layout 键盘回归（BAD 参照） |
| `a68cf29` | 隔离实验：删除 Loading required compression resistance 后真机恢复 |
| `69ca713` | 正式删除 Loading required compression resistance |
| `82f55b7` | 恢复 Settings portal 正确 stacking order |
| `1598d94` | 阻止启动脚本 focus 导致键盘闪现 |
| `2633421` | Session 稳定后再 reveal，消除新会话闪跳 |
| `c0ff7cb` | Stable closeout：阅读锚点、JS CI、Loading 幂等 |
| `f2dde4d` | **1.1.0 原始 Stable 运行代码回退点** |
| `28a516d` | DSH operational selector registry / Compatibility Layer v1 |
| `fcb5360` | rc.8 authenticated Settings capability bridge |
| `49a2705` | rc.8 iOS 兼容与视觉收口 |
| `6a6b480` | Composer focus 时回最新消息 / bottom pinned 行为 |

---

## 16. Compatibility Layer 当前状态

`v1.1.1` 已把第一版 DSH Seamless Upgrade / Compatibility Layer 纳入 Stable：

- operational selector 集中 registry；
- rc.7 / rc.8 静态 UI contract audit；
- exact candidate dependency graph；
- authenticated rc.8 Settings capability bridge；
- candidate -> browser gate -> iOS CI -> true-device gate -> promote 的固定流程。

详细流程见 [`docs/DSH-UPGRADE-COMPAT.md`](docs/DSH-UPGRADE-COMPAT.md)。`f2dde4d` 继续作为 1.1.0 原始运行代码的硬回退锚点。

后续可以单独做、但不要混入小修：

- `SceneDelegate.swift` 拆分；
- 私有 CSS Module 依赖继续收敛；
- 旧 plugin / storyboard 等历史资产清理；
- [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md) 中的发送后键盘 first-responder 调查。

