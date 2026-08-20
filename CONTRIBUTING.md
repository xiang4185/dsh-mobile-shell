# Contributing

Contributions are welcome. Keep changes small, reviewable, and aligned with the existing architecture.

## Development setup

Requirements vary by target:

- Node.js 20+
- Android: JDK 17–21 and the Android SDK
- iOS: macOS and Xcode

Install JavaScript dependencies:

```sh
npm --prefix app ci
npm --prefix proxy ci
```

## Before making changes

For general architecture and decisions, start with [`docs/README.md`](docs/README.md).

For iOS changes, read:

- [`IOS-STABLE-BASELINE.md`](IOS-STABLE-BASELINE.md)
- [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md)

For DSH upstream-version work, also read [`docs/DSH-UPGRADE-COMPAT.md`](docs/DSH-UPGRADE-COMPAT.md).

## Change guidelines

1. Prefer one focused change per pull request.
2. Do not mix unrelated refactors into bug fixes.
3. Preserve upstream DSH behavior; the mobile shell should adapt the official Web UI rather than reimplement it.
4. Keep operational DSH selectors inside the compatibility registry instead of adding scattered private CSS-module queries.
5. Do not commit credentials, tokens, local machine paths, private hostnames, personal IP addresses, or test-account data.
6. Add or update documentation when a public contract, setup step, compatibility rule, or known limitation changes.

## iOS invariants

The current iOS architecture has true-device regression history. Unless a change explicitly proves one of these is the root cause:

- keep `SceneDelegate -> DSHKeyboardViewportViewController -> DSHBridgeViewController`;
- keep `keyboardLayoutGuide` as the only keyboard viewport driver;
- keep Capacitor `Keyboard.resize = none`;
- do not add `visualViewport`, keyboard-frame-to-JS, delayed scroll correction, or `scrollIntoView()` keyboard workarounds;
- preserve Settings / Drawer portal stacking (`1000` surfaces, body portals above them);
- preserve approximately 44pt mobile hit targets;
- do not add required compression resistance to the native loading image.

## Validation

Run the checks relevant to your change. For iOS / shared release work, the standard local gate is:

```sh
git diff --check
node scripts/verify-ios-embedded-js.mjs
npm --prefix app run typecheck
node scripts/verify-launcher.mjs
node scripts/verify-pairing-qr.mjs
npm run verify:version
npm run package:web
npm run verify:web
```

For DSH compatibility work:

```sh
npm run audit:dsh-compat
```

For proxy changes, run the proxy verification suite described in [`proxy/README.md`](proxy/README.md).

Changes that touch mobile layout, keyboard behavior, Settings, Drawer, Composer, or upstream DSH compatibility should also pass the relevant real-device gate before release.

## Commits and pull requests

- Use concise imperative commit subjects, for example `fix-ios: preserve reader position`.
- Explain the user-visible problem and why the chosen fix is safe.
- Include verification performed and any known limitations.
- Do not rewrite formal release tags after publication.

## Security issues

Do not disclose exploitable security issues, credentials, or private deployment details in a public issue. Follow [`SECURITY.md`](SECURITY.md).
