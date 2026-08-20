# dsh-mobile-shell agent notes

Before changing iOS code, read [`IOS-STABLE-BASELINE.md`](IOS-STABLE-BASELINE.md) and [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md).

The current Stable release is `v1.1.1`. Commit `f2dde4d` remains the original iOS 1.1.0 runtime rollback anchor.

Keep these invariants unless the task specifically proves one is the root cause:

- Preserve `SceneDelegate -> DSHKeyboardViewportViewController -> DSHBridgeViewController`.
- `keyboardLayoutGuide` is the only keyboard viewport driver; Capacitor `Keyboard.resize` stays `none`.
- Do not add `visualViewport`, keyboard-frame-to-JS, delayed scroll compensation, or `scrollIntoView` keyboard fixes.
- Do not re-parent DSH Settings React DOM. Preserve Settings/sidebar `z=1000` and body popup portals above it (`z=1100`).
- Preserve rectangular ~44pt Composer hit targets even when the visual control is round/capsule-shaped.
- Do not re-add required compression-resistance priorities to the native Loading image.
- Do not touch Android as a side effect of an iOS task.
- Keep changes narrow and run `node scripts/verify-ios-embedded-js.mjs` after editing embedded iOS JS.

When a regression appears, compare against `f2dde4d` first and prefer true-device evidence over speculative fixes.

For any DSH upstream-version work, also read [`docs/DSH-UPGRADE-COMPAT.md`](docs/DSH-UPGRADE-COMPAT.md). Use the compatibility registry and `scripts/audit-dsh-compat.mjs`; do not add new scattered private-class queries or replace the Stable host before a separately pinned candidate passes its gates.

