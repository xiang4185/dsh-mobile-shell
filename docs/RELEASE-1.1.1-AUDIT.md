# v1.1.1 Stable 封版审计

日期：2026-08-20

结论：**PASS，可封版。** 当前只保留一个明确记录、非阻断的已知问题：iOS 成功发送消息后软件键盘不会自动收起。详情见 [`../KNOWN-ISSUES.md`](../KNOWN-ISSUES.md)。

## 1. 封版范围

`v1.1.1` 在原 1.1.0 真机稳定架构上纳入第一版 DSH Seamless Upgrade / Compatibility Layer，并完成 rc.7 -> rc.8 上游适配。

核心内容：

- DSH operational selector 集中 registry；
- rc.7 / rc.8 UI contract 自动审计；
- prerelease Candidate 全图精确锁版本；
- rc.8 authenticated Settings capability bridge；
- iOS 图片附件入口与上游真实能力对齐；
- Composer 模型/Agent 预设视觉收口，44pt 点击区保留；
- Composer 获得输入意图时统一回到最新消息并保持 bottom pinned；
- rc.8 正式提升为 Stable Host。

## 2. 原稳定架构防回归审查

封版前确认以下约束仍成立：

- Root Controller 仍为 `SceneDelegate -> DSHKeyboardViewportViewController -> DSHBridgeViewController`；
- `keyboardLayoutGuide` 仍是唯一 native viewport driver；
- Capacitor `Keyboard.resize = none`；
- 未引入 `visualViewport`、keyboard-frame -> JS、keyboard-height JS/CSS、`scrollIntoView()`、第二套 resize 或延迟键盘滚动补偿；
- Loading 图片未恢复 `.required` compression resistance；
- Settings/sidebar 继续处于 `z=1000`，DSH body portal 继续能以 `z=1100` 位于其上方；
- Composer 圆形/胶囊视觉与真实约 44pt hitbox 继续分离；
- rc.8 iOS 适配没有引入 Android 功能逻辑修改，Android 仅同步发布版本号。

## 3. 本地自动 Gate

以下检查全部通过：

```text
git diff --check                                      PASS
node scripts/verify-version.mjs v1.1.1              PASS
node scripts/verify-ios-embedded-js.mjs              PASS
npm --prefix app run typecheck                       PASS
node scripts/verify-launcher.mjs                     PASS
node scripts/verify-pairing-qr.mjs                   PASS
DSH UI audit rc.7 -> rc.8                            PASS
npm run package:web                                  PASS
npm run verify:web                                   PASS
duplicate/prohibited keyboard-driver pattern scan    PASS
```

独立临时 Proxy 对真实 rc.8 Host 又跑了一次 HTTP/WS 安全矩阵，认证、同源限制、WebSocket、设备令牌、一次性配对、限流、authenticated Settings bridge 等全部通过。

## 4. rc.8 运行态 Gate

精确安装图：

```text
187 / 187 top-level @deepseek-ai/dsh* prerelease packages = 0.1.0-rc.8
mixed prerelease versions = 0
```

当前封版 iOS 注入脚本在真实 rc.8 页面验证：

- Frame / Sidebar / Main 正常；
- Composer input / add / model 正常；
- 从历史中间位置产生输入意图后，消息区直接定位到当前最大 `scrollTop`；
- Settings 四分类正常；
- Settings 下拉仍挂到 `BODY`，`z-index=1100`；
- Model Settings 通过正式 3081 authenticated Proxy 正常显示 DeepSeek provider 目录；
- “当前主机”在非 General Settings 页面 computed `display:none`。

## 5. GitHub CI

封版提交 `73ae1a9` 的独立分支 CI：

- `build-ios #32389968559` — **success**
- `build-android #32389972235` — **success**
- `verify-proxy #32389975564` — **success**

iOS CI 覆盖 Simulator、unsigned Device、IPA、Embedded JS；Android CI 用于确认版本同步未破坏构建；Proxy CI 覆盖跨浏览器与安全路径。

## 6. 真机已确认事实

rc.8 真机测试已确认：

- 模型 Settings 在兼容桥修复后正常；
- 键盘连续开关正常；
- Agent 预设 / 模型选择多余视觉胶囊已消失；
- 模型选择字体无异常；
- 图片可以进入附件链；当前模型若声明不支持图片，发送时由 DSH 正常拒绝；
- 普通文件并非 rc.8 支持能力，因此 iOS picker 已明确限制到 PNG/JPG/WebP/GIF。

## 7. Stable Host 提升结果

rc.8 已从 Candidate 提升到正式 3080：

```text
3080  rc.8 Stable DSH Web           200
3081  Stable authenticated Proxy    200
public /healthz                     200
```

正式 Proxy 已加载 rc.8 Settings bridge，原公网 Tunnel、配对身份和设备凭据签名密钥保持不变。临时 3090/3091 Candidate 服务已停止。

rc.7 安装目录和旧 Stable drop-in 备份继续保留，可快速回退。

## 8. 唯一开放问题

**成功发送后 iOS 软件键盘不会自动收起。**

已经真机证明 `textarea.blur()` 和提交后原生 `view.endEditing(true)` 都不能可靠解决，因此两条实验 workaround 已从封版代码删除。以后应单独抓 WKWebView first-responder / DSH React focus 生命周期，不允许为此重新引入第二套键盘 viewport/scroll 补偿。

该问题不影响消息发送、连续开关键盘、bottom-pinned viewport 或其他已验收功能，因此本次作为明确 Known Issue 留待后续专项处理。
