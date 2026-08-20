# dsh-mobile-shell

English | [中文](README.zh.md)

`dsh-mobile-shell` is a community mobile client and authenticated remote-access layer for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It does not run Harness on the phone. Android, iOS, and browser clients connect to a self-hosted `dsh web` instance.

> **Not an official DeepSeek product.** This is an independent community project released under the MIT License.

## Features

- Lightweight Android and iOS shells that load the original DSH Web UI served by the host.
- Browser mode with QR pairing and no app installation required.
- `dsh-remote` authenticated reverse proxy with device sessions, one-time pairing codes, WebSocket authentication, and origin checks.
- Native iOS keyboard viewport handling plus mobile Drawer, Settings, and Composer adaptations.
- DSH Compatibility Layer for auditing upstream UI-contract changes before promotion.
- Android, iOS, and Web artifacts published through GitHub Releases.

## Architecture

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

Harness, shell/file access, tool execution, and model calls remain on the host. The mobile layer handles connectivity, authentication, and mobile UX adaptation.

## Quick start

### 1. Host requirements

- Node.js 20 or newer
- A working DeepSeek Harness / `dsh web` installation
- A trusted LAN or private overlay network such as Tailscale; public deployments should use trusted TLS

### 2. Start on a trusted LAN

```sh
git clone <repository-url>
cd dsh-mobile-shell
node scripts/start-lan.mjs
```

The launcher starts `dsh web` on loopback, starts the authenticated proxy, and prints a one-time pairing QR code. Scan it on the phone and explicitly confirm the pairing.

If the host has multiple private addresses:

```sh
DSH_LAN_IP=<private-lan-ip> node scripts/start-lan.mjs
```

### 3. Use a client

- **Android:** download the APK from this repository's **Releases** page.
- **iOS:** Releases include an unsigned IPA; device installation still requires your own signing, a sideloading tool, or Xcode.
- **Browser:** scan the QR code printed by the host; no app installation is required.

Paired clients receive a scoped device credential. The master token is not stored in browser URLs or normal Web Storage.

## Manual startup

To manage the processes yourself:

```sh
npx @deepseek-ai/dsh web --port 3080

DSH_REMOTE_TOKEN="$(openssl rand -hex 16)" \
DSH_TARGET_PORT=3080 \
node proxy/dsh-remote.mjs
```

By default:

- `dsh web` stays on loopback;
- `dsh-remote` authenticates HTTP and WebSocket traffic;
- plain HTTP is intended only for trusted private networks;
- public deployments should use a certificate issued by a trusted CA.

See [`proxy/README.md`](proxy/README.md) for the full proxy configuration.

## Build from source

Install the app dependencies:

```sh
npm --prefix app install
```

Android:

```sh
cd app/android
./gradlew assembleDebug
```

iOS requires macOS and Xcode:

```sh
xcodebuild \
  -project app/ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  build
```

See [`docs/02-build-and-dependencies.md`](docs/02-build-and-dependencies.md) and [ADR-0005](docs/decisions/ADR-0005-ios-vendored-capacitor-spm.md) for build dependencies and the vendored iOS SPM setup.

## Compatibility and upgrades

The current Stable release is **v1.1.1**. It has been validated against DSH `0.1.0-rc.8`, including real iOS-device testing.

DSH uses CSS Modules and internal UI contracts, so an upstream upgrade is not treated as a simple package-version bump. The repository provides a compatibility audit:

```sh
npm run audit:dsh-compat
```

Candidate DSH versions must pass the static contract audit, an isolated Candidate Host, runtime browser checks, CI, and any relevant true-device gates before promotion. See [`docs/DSH-UPGRADE-COMPAT.md`](docs/DSH-UPGRADE-COMPAT.md).

## Known issues

Non-blocking known issues are tracked in [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md). One current issue is that the iOS software keyboard remains visible after a successful message send.

Do not work around this by introducing a second keyboard resize/scroll driver. The stable iOS invariants are documented in [`IOS-STABLE-BASELINE.md`](IOS-STABLE-BASELINE.md).

## Security

`dsh web` can reach high-privilege tools on the host. Do not expose it directly to the public Internet.

- Keep DSH itself bound to loopback.
- Put `dsh-remote` at the authentication boundary.
- Never commit master tokens or put them in screenshots, URLs, or frontend code.
- Use plain HTTP only on trusted private networks.
- Use trusted TLS and least-privilege deployment practices for public access.

See [`SECURITY.md`](SECURITY.md) for the security model, vulnerability-reporting guidance, and deployment notes.

## Repository layout

| Path | Purpose |
|---|---|
| [`app/`](app/) | Capacitor Android / iOS mobile shells |
| [`proxy/`](proxy/) | `dsh-remote` authenticated reverse proxy |
| [`scripts/`](scripts/) | Startup, packaging, verification, and compatibility scripts |
| [`compat/`](compat/) | DSH UI compatibility contract |
| [`docs/`](docs/) | Architecture, ADRs, historical implementation notes, and upgrade docs |

## Development and releases

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before contributing.

The root `package.json` is the version source of truth. Android, iOS, Proxy, and the Web artifact are checked for consistency:

```sh
npm run verify:version
npm run package:web
npm run verify:web
```

Stable releases use `v<semver>` tags. See [`CHANGELOG.md`](CHANGELOG.md) for release notes.

## License

[MIT](LICENSE). Vendored components retain their own licenses. DeepSeek Harness is maintained and licensed independently by its upstream project.
