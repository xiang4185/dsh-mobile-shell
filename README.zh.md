# dsh-mobile-shell

[English](README.md) | 中文

`dsh-mobile-shell` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区移动客户端与安全远程访问层。它不会把 Harness 搬到手机上运行，而是通过 Android / iOS WebView 或普通浏览器连接你自己托管的 `dsh web`。

> **非 DeepSeek 官方产品。** 本项目是独立社区项目，遵循 MIT License。

## 特性

- Android / iOS 轻量移动壳，直接加载主机提供的原版 DSH Web UI。
- 浏览器 Web 模式，无需安装 App 也可扫码配对使用。
- `dsh-remote` 认证反向代理：设备会话、一次性配对码、WebSocket 鉴权与同源限制。
- iOS 原生键盘 viewport 适配、移动 Drawer / Settings / Composer 交互优化。
- DSH Compatibility Layer：集中管理上游 UI contract，并支持候选版本升级审计。
- Android、iOS、Web 产物由 GitHub Releases 统一发布。

## 架构

```text
Phone / Browser
      │
      ▼
dsh-mobile-shell
  ├─ Android / iOS WebView
  └─ Browser launcher
      │
      ▼
dsh-remote (authenticated proxy)
      │
      ▼
dsh web (loopback only)
      │
      ▼
DeepSeek Harness / tools / workspace
```

Harness 本体、Shell、文件访问、工具执行和模型调用都留在主机上。移动端只负责连接、认证与移动体验适配。

## 快速开始

### 1. 主机要求

- Node.js 20 或更高版本
- 可正常运行的 DeepSeek Harness / `dsh web`
- 手机与主机位于可信局域网、Tailscale 等私有网络；公网部署应使用可信 TLS

### 2. 一键启动局域网模式

```sh
git clone <repository-url>
cd dsh-mobile-shell
node scripts/start-lan.mjs
```

脚本会启动 loopback 上的 `dsh web` 与认证代理，并打印一次性配对二维码。手机扫描二维码并确认后即可进入 Harness。

如果主机存在多个局域网地址，可显式指定：

```sh
DSH_LAN_IP=<private-lan-ip> node scripts/start-lan.mjs
```

### 3. 使用 App

- **Android**：从当前仓库的 **Releases** 页面下载 APK。
- **iOS**：Releases 提供 unsigned IPA；真机安装仍需要你自己的签名、侧载工具或 Xcode。
- **浏览器**：直接扫描主机终端显示的二维码，无需安装 App。

已经配对的设备会保存受限设备凭据，主令牌不会写入浏览器 URL 或普通 Web Storage。

## 手动启动

需要自行管理进程时，可以分别启动 Harness 与代理：

```sh
npx @deepseek-ai/dsh web --port 3080

DSH_REMOTE_TOKEN="$(openssl rand -hex 16)" \
DSH_TARGET_PORT=3080 \
node proxy/dsh-remote.mjs
```

默认情况下：

- `dsh web` 保持 loopback；
- `dsh-remote` 对 HTTP 与 WebSocket 请求执行认证；
- 明文 HTTP 只适合可信私有网络；
- 公网部署应配置真实 CA 签发的 TLS 证书。

代理完整配置见 [`proxy/README.md`](proxy/README.md)。

## 从源码构建

安装 JavaScript 依赖：

```sh
npm --prefix app install
```

Android：

```sh
cd app/android
./gradlew assembleDebug
```

iOS 需要 macOS + Xcode：

```sh
xcodebuild \
  -project app/ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  build
```

构建依赖与离线 iOS SPM 说明见 [`docs/02-build-and-dependencies.md`](docs/02-build-and-dependencies.md) 与 [ADR-0005](docs/decisions/ADR-0005-ios-vendored-capacitor-spm.md)。

## 兼容性与升级

当前 Stable 为 **v1.1.1**。该版本已完成 DSH `0.1.0-rc.8` 的真实运行与 iOS 真机兼容验证。

上游 DSH 使用 CSS Modules 和内部 UI contract，升级不能只改一个 npm 版本。项目提供：

```sh
npm run audit:dsh-compat
```

候选版本必须经过静态 contract audit、独立 Candidate Host、浏览器运行验证、CI 与必要的真机 Gate 后才能提升为 Stable。维护流程见 [`docs/DSH-UPGRADE-COMPAT.md`](docs/DSH-UPGRADE-COMPAT.md)。

## 已知问题

当前非阻断遗留问题集中记录在 [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md)。其中包括 iOS 成功发送消息后软件键盘不会自动收起的问题。

不要通过新增第二套键盘 resize / scroll 补偿绕过该问题；iOS 稳定架构约束见 [`IOS-STABLE-BASELINE.md`](IOS-STABLE-BASELINE.md)。

## 安全

`dsh web` 能访问主机上的高权限工具，因此不要直接暴露到公网。

- 保持 DSH 本体监听 loopback。
- 使用 `dsh-remote` 作为认证边界。
- 不要把主令牌写进仓库、截图、URL 或前端代码。
- 明文 HTTP 只用于可信私有网络。
- 公网访问必须使用可信 TLS，并按最小权限原则部署。

安全模型、漏洞报告方式和部署注意事项见 [`SECURITY.md`](SECURITY.md)。

## 仓库结构

| 路径 | 说明 |
|---|---|
| [`app/`](app/) | Capacitor Android / iOS 移动壳 |
| [`proxy/`](proxy/) | `dsh-remote` 认证反向代理 |
| [`scripts/`](scripts/) | 启动、打包、验证与兼容性审计脚本 |
| [`compat/`](compat/) | DSH UI compatibility contract |
| [`docs/`](docs/) | 架构、ADR、历史实施记录与升级文档 |

## 开发与发布

贡献前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

版本号以根目录 `package.json` 为唯一来源，并同步校验 Android、iOS、Proxy 与 Web artifact：

```sh
npm run verify:version
npm run package:web
npm run verify:web
```

正式版本使用 `v<semver>` tag。变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 许可证

[MIT](LICENSE)。Vendored 组件保留各自许可证。DeepSeek Harness 本体由其上游项目独立维护与授权。
