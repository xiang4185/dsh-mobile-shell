# Roadmap

Status: **post-v1.1.1 Stable**.

`v1.1.1` ships the authenticated Web path plus Android/iOS mobile shells and the first DSH Compatibility Layer. The project is no longer in the earlier “Web-first, mobile deferred” phase.

This roadmap lists work that remains useful after the current Stable release. It is not a release promise or fixed schedule.

## Current baseline

| Area | Status | Notes |
|---|---|---|
| Authenticated proxy | Stable | HTTP / WebSocket authentication, pairing, scoped device sessions, origin checks |
| Browser launcher | Stable | QR pairing and zero-install Web flow |
| Android shell | Stable artifact | APK produced by the release workflow |
| iOS shell | Stable artifact | Simulator package + unsigned device IPA; distribution signing remains user-managed |
| iOS mobile UX | Stable with known issue | Native keyboard viewport, Drawer, Settings, Composer adaptations; see `KNOWN-ISSUES.md` |
| DSH compatibility | Stable process | rc.8 validated; future upgrades use Candidate Host + contract audit |
| Device administration | Partial | Device credentials exist; full user-facing device lifecycle management is still limited |
| Internationalization / accessibility | Partial | Core DSH UI follows upstream; shell/launcher coverage can be improved |

## P0 — Maintain compatibility and reliability

### DSH upstream upgrades

Every upstream DSH upgrade should follow [`DSH-UPGRADE-COMPAT.md`](DSH-UPGRADE-COMPAT.md):

1. generate an exact candidate dependency graph;
2. run the static UI-contract audit;
3. run the candidate on a separate host/port;
4. verify browser and proxy behavior;
5. run iOS CI and any affected true-device gates;
6. promote only after all relevant checks pass.

Do not weaken the stable iOS keyboard/bootstrap architecture merely to accommodate an upstream UI change.

### Known iOS keyboard issue

Investigate the remaining WKWebView first-responder behavior where the software keyboard stays visible after a successful send. This should be handled as a focused first-responder lifecycle investigation, not by introducing another viewport/scroll compensation path.

See [`../KNOWN-ISSUES.md`](../KNOWN-ISSUES.md).

## P1 — Device lifecycle and administration

Improve device-session management without exposing long-lived credentials to frontend storage:

- list paired devices with stable identifiers and expiration metadata;
- allow a user/admin to revoke one device without rotating every credential;
- add explicit “sign out this device” and “forget this host” flows;
- make expiry, revocation, and upstream-unreachable errors distinguishable;
- keep credentials out of URLs, normal Web Storage, logs, and analytics.

Any persistent device registry should fail closed on corruption and avoid storing bearer tokens in plaintext.

## P1 — Deployment experience

- document minimal reverse-proxy examples for common trusted-TLS deployments;
- improve startup diagnostics for host reachability, selected listen/public address, and TLS state;
- keep the zero-install browser flow simple for trusted LAN/private-network use;
- provide clear guidance for upgrading the proxy and DSH host independently.

## P1 — Accessibility and internationalization

- ensure launcher and shell-owned text supports at least Chinese and English consistently;
- keep E2E tests tied to semantic roles/test IDs instead of language-specific visible text;
- verify keyboard navigation, visible focus, live-region errors, 200% zoom, and narrow screens;
- keep mobile Safari and mobile Chrome in the browser regression set.

## P2 — Distribution

The repository publishes an Android APK and unsigned iOS IPA. Possible future distribution improvements:

- signed Android release artifacts / AAB where appropriate;
- reproducible iOS Archive workflow;
- optional TestFlight/App Store distribution if signing and account ownership are established;
- release provenance / checksums for downloadable artifacts.

Unsigned iOS artifacts should remain available for users who manage their own signing or sideloading.

## P2 — Plugin and extension compatibility

DSH plugins and additional Web modules should primarily live on the Host. The mobile shell should inherit them through the official DSH Web UI instead of duplicating plugin logic in native code.

For plugins that add or substantially change UI surfaces, add a lightweight mobile compatibility gate covering:

- Drawer / navigation entry;
- Settings / body portals;
- Composer controls;
- keyboard interaction;
- narrow-screen layout and hit targets.

Prefer semantic capability detection over plugin/version-specific hacks.

## Later / evaluate separately

- push notifications, which require a separate trust/privacy design;
- full offline caching of the DSH UI, which would require explicit host/client version negotiation;
- deeper PWA support beyond the current zero-install launcher;
- larger native-only features that would duplicate upstream DSH behavior.

## Release gate

Before a new Stable release:

- version synchronization passes;
- Web artifact packaging and verification pass;
- Proxy HTTP/WS security tests pass;
- Android and iOS CI pass;
- DSH compatibility audit passes when upstream DSH changed;
- affected true-device gates pass;
- `KNOWN-ISSUES.md`, `CHANGELOG.md`, README, and release notes reflect the shipped behavior;
- public documentation contains no secrets, private host details, or personal environment paths.
