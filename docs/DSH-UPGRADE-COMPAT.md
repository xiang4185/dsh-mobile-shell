# DSH Seamless Upgrade / Compatibility Layer

This track starts **after** the iOS 1.1.0 Stable freeze. It must not change the stable keyboard, bootstrap, Loading, Settings stacking, or Drawer event contracts merely to accommodate an upstream DSH release.

Stable reference:

- Current Stable release: `v1.1.1`
- Previous formal release snapshot: `v1.1.0`
- Canonical branch: `main`

The pre-release diagnostic branches/commit IDs used while building this layer were intentionally removed when GitHub history was compacted after `v1.1.1`. Future comparisons should use formal release tags and the behavior contracts documented here.

## Goal

Turn future DSH upgrades into a controlled candidate-host check:

```text
Stable host
  remains untouched

Candidate DSH version
  -> exact package lock
  -> static UI contract audit
  -> runtime capability adapter
  -> browser/iOS compatibility gate
  -> promote only after pass
```

The mobile shell should depend on semantic capabilities where possible. Upstream CSS-module names are treated as a compatibility boundary, not scattered implementation details.

## Current upstream status (2026-08-20)

At the start of this track:

```text
npm latest -> @deepseek-ai/dsh 0.1.0-rc.7
npm next   -> @deepseek-ai/dsh 0.1.0-rc.8
```

Important: DSH packages use ranges such as `^0.1.0-rc.7`. SemVer accepts `0.1.0-rc.8` for that range. Therefore installing only the root package at rc.7 does **not** prove that the candidate is an all-rc.7 stack.

Use:

```bash
node scripts/prepare-dsh-candidate.mjs 0.1.0-rc.7 --output /tmp/dsh-rc7
```

The script recursively discovers `@deepseek-ai/dsh*` production, optional, and peer dependencies and writes npm `overrides` that pin the whole discovered graph to the requested prerelease. Add `--install` only when an actual candidate host is needed.

This distinction matters. A first pass that followed production dependencies only still allowed npm to satisfy rc.7 peer ranges with rc.8 packages. The corrected graph walk currently pins 186 DSH prerelease packages for rc.7; an installed candidate lock was verified to contain **zero mixed rc.8 DSH prerelease entries**.

## First static audit: rc.6 / rc.7 / rc.8

Run:

```bash
node scripts/audit-dsh-compat.mjs --baseline 0.1.0-rc.6 --candidate 0.1.0-rc.7,0.1.0-rc.8
```

The audit reads the private CSS-module classes currently referenced by `SceneDelegate.swift`, downloads the exact upstream UI packages listed in `compat/dsh-ui-contract.json`, and compares the candidate against the baseline corpus.

Initial result:

- rc.6 -> rc.7: no contract-breaking removal among the Stable-referenced baseline classes.
- rc.7 -> rc.8: the only Stable-referenced class removed is `hHd-Xa_railFish`.
- `hHd-Xa_railFish` is decorative and is explicitly tolerated. rc.8 replaces the old sidebar branding with `brandIdentity / brandMark / brandName / buildRevision / railMark` classes.
- rc.8 also refactors conversation attachment/reference rendering. For example, `uV2eYG_attachments` and `uV2eYG_chipLabel` disappear while new trigger/reference classes are introduced. Stable 1.1.0 does not currently depend on those removed classes, but attachment behavior still requires runtime regression testing.

This makes **rc.7 the first promotion candidate** and **rc.8 the first structural stress-test candidate**.

## rc.7 first runtime result

An all-rc.7 candidate was started separately on `127.0.0.1:3090` while the existing Stable host on `3080` remained untouched. The current iOS mobile injection plus compatibility registry was then applied to the real rc.7 page at an iPhone-sized viewport.

Verified on rc.7:

- mobile compatibility revision attached successfully;
- frame / sidebar / main surfaces resolved;
- conversation reached a stable `hero` state without blocking reveal;
- Composer input / attachment / permission / model controls resolved;
- Drawer opened and its view/sort menu rendered above it at `z-index: 1100`;
- Settings opened with the expected four sections;
- Agent preset menu rendered through the body portal at `z-index: 1100`;
- the General-page current-host entry was injected normally.

The same compatibility-registry build was also injected against the existing Stable DSH host and resolved frame/sidebar/main, active conversation, Composer, and Settings normally. This is the required A/B check before any upstream candidate is promoted.

### rc.7 promotion result

The rc.7 candidate subsequently passed the true-device iOS gate with no observed regression from the previous Stable host. It was therefore promoted to the production DSH Web slot on port 3080 while the existing proxy/session/tunnel chain remained unchanged. The previous rc.6 host directory is retained as the immediate rollback source.

Promotion policy confirmed by this upgrade:

```text
candidate exact stack -> browser gate -> iOS CI -> true-device gate
-> replace only the DSH Web executable path
-> keep proxy / pairing / public endpoint unchanged
-> retain previous host for rollback
```

## rc.8 stress-test result

rc.8 is the first candidate with a meaningful upstream UI structure change, so it was used to pressure-test the compatibility workflow before promotion.

### Exact install graph

The rc.8 graph contains 187 `@deepseek-ai/dsh*` packages. A normal npm peer-resolution install was not suitable for deterministic candidate generation: with the exact overrides present, npm spent minutes in peer solving/GC and exceeded Node's default old-space limit.

`prepare-dsh-candidate.mjs` therefore now:

1. discovers all DSH production, optional, and peer dependency edges;
2. writes every discovered DSH package as an exact direct dependency;
3. keeps exact overrides for the same DSH graph;
4. adds the small set of required non-DSH peer packages as direct dependencies;
5. installs with `--legacy-peer-deps` to avoid redundant peer graph search;
6. raises npm's Node old-space ceiling to 4 GiB for large prerelease graphs.

For rc.8 the generated manifest contains:

```text
187 exact DSH direct dependencies @ 0.1.0-rc.8
5 required non-DSH peers
```

The installed lock was checked at the top-level DSH package boundary:

```text
187 / 187 DSH packages = 0.1.0-rc.8
mixed DSH prerelease versions = 0
```

### rc.8 browser/runtime gate

The exact rc.8 host was started separately from rc.7 Stable and exercised with the current iOS compatibility injection at an iPhone-sized viewport.

Verified:

- frame / sidebar / main surfaces resolve;
- Session reaches `hero`/`active` state normally;
- Composer input, add, permission, model, and Agent preset controls resolve;
- the iOS attachment hook still attaches to the Composer add control;
- Drawer opens and View/Sort remains a body portal above the Drawer at `z-index: 1100`;
- Settings opens, all four Settings categories are present, and the General-only current-host row still hides on the Model tab;
- Agent preset portal remains above Settings at `z-index: 1100`;
- permission and model menus still open;
- rc.8's new sidebar branding uses `hHd-Xa_railMark`; removal of the old decorative `hHd-Xa_railFish` does not break Drawer layout.

The synthetic document-drop attachment probe is not a promotion signal by itself: both rc.7 and rc.8 consume the generated drop event without rendering a visible file preview in headless Chromium. Attachment selection/upload therefore remains an explicit true-device rc.8 gate instead of being inferred from that synthetic probe.

### rc.8 true-device findings

The first rc.8 iPhone pass exposed four real compatibility/UX differences that the headless gate did not fully cover:

1. **Model Settings unavailable through the authenticated proxy.** rc.8 changed the settings client so non-loopback browser locations use an in-memory/unavailable mirror and never call `settings.describe`. This is an upstream security default for deployments with no remote authentication. `dsh-remote` already supplies the missing trust boundary: protected UI/API requests have passed the device/master-token gate and same-origin check before being forwarded onto loopback. The proxy now patches only the authenticated `@deepseek-ai/dsh-client-connection/client.js` response to promote that connection handle to loopback capability. Direct `dsh web` behavior remains unchanged. A fresh authenticated proxy load was verified to render the Model Settings provider directory (`DeepSeek`, edit/add-provider controls) instead of `settings are unavailable in this browser`.
2. **Attachments are images only upstream.** rc.7/rc.8 conversation docs and the new rc.8 attachment package explicitly support PNG/JPG/WebP/GIF only; non-image rail/history rendering does not exist yet. The iOS native picker is therefore restricted to those image MIME types instead of allowing arbitrary files that upstream will reject. A selected image can still be refused at send time when the current model reports `MODEL_DOES_NOT_SUPPORT_IMAGES`; this is model capability, not an upload failure.
3. **Reader position was nondeterministic only on the near-bottom branch.** Mid-history `data-chat-anchor-key` preservation remained deterministic under repeated `701 <-> 500` viewport changes. The existing `<=24px from bottom` branch intentionally cleared the anchor and delegated bottom pinning to DSH/WebKit, which can vary during real keyboard animation. The scroll layer now remembers that it was pinned and deterministically restores `scrollTop = maxScrollTop` on resize. It still uses only the message `ResizeObserver`; no keyboard event or JS keyboard-height path was introduced.
4. **Composer control chrome needed cleanup.** Agent preset/model visual capsule pseudo-elements are removed while their real ~44pt rectangular hit targets stay intact. The model trigger font is reduced from 15px to 14px.
5. **Mobile input intent now means return to latest.** Preserving a mid-history anchor while the keyboard opens is no longer the desired phone interaction. A pointer/focus intent on the Composer textarea first marks the reader bottom-pinned and moves the conversation scroller to its current maximum; the existing message `ResizeObserver` then keeps it pinned while `keyboardLayoutGuide` changes the native viewport. This adds no keyboard event, `visualViewport`, keyboard-height JS, `scrollIntoView`, or delayed keyboard scroll correction. True-device testing shows that a successful send still leaves the iOS software keyboard open; attempted textarea blur and native `endEditing(true)` workarounds were removed before Stable freeze because neither fixed the real-device behavior. The deferred investigation is recorded in [`../KNOWN-ISSUES.md`](../KNOWN-ISSUES.md).

### rc.8 promotion result

After the compatibility fixes and release audit, rc.8 was promoted to the Stable DSH Web slot on port 3080 on 2026-08-20.

The promotion preserved the deployment boundary established by rc.7:

```text
3080  exact rc.8 DSH Web
3081  authenticated dsh-remote proxy with the rc.8 Settings bridge
public tunnel / pairing identity unchanged
rc.7 host directory retained for immediate rollback
```

Post-promotion checks confirmed:

- 187 / 187 top-level DSH prerelease packages are exactly `0.1.0-rc.8`, with no mixed prerelease version;
- Stable Web, Stable Proxy, and the existing public `/healthz` endpoint all return 200;
- the authenticated Stable proxy renders the Model Settings provider directory instead of the rc.8 remote-browser unavailable state;
- the Model-page current-host row remains present only as hidden DOM (`display: none`) outside General Settings;
- the temporary 3090/3091 Candidate Web/Proxy/Tunnel services were stopped after promotion;
- the rc.7 host directory remains available as the rollback source.

The only intentionally deferred iOS issue is successful-send keyboard dismissal. It is not treated as an rc.8 host regression and is recorded in [`../KNOWN-ISSUES.md`](../KNOWN-ISSUES.md); the failed blur/native-dismiss experiments are not part of Stable code.

## 0.2.1-alpha.1 candidate (Stable rc.8 line)

Opened after `v1.1.1`. Nothing here is promoted: rc.8 remains the Stable DSH Web
slot, and the failure path is always "keep the rc.8 host".

Exact release: `@deepseek-ai/dsh@0.2.1-alpha.1` (root package). The candidate
graph is generated by `scripts/prepare-dsh-candidate.mjs 0.2.1-alpha.1`, which
pins every discovered `@deepseek-ai/dsh*` production/optional/peer package to
that exact prerelease plus the required non-DSH peers. For this candidate the
generated manifest contains **280 exact DSH direct dependencies** and 6 required
non-DSH peers; the installed graph is checked for zero mixed DSH prerelease
packages by the same script and by `scripts/verify-dsh-021-alpha1.mjs`.

### What upstream changed

1. **Browser-session authentication.** `dsh web` now prints
   `http://127.0.0.1:<port>/?token=<launch>` and gates its UI plus `/api` on the
   authority-bound `dsh-auth-*` cookie that launch token mints. The proxy cannot
   forward a device to the UI without that upstream session.
2. **Sidebar CSS module re-hash.** The workspace/session list module moved from
   `qDHVXG_*` to `bhn1Oq_*` with identical suffixes.
3. **Permission select moved packages.** The Composer permission select left
   `dsh-client-ui-conversation` (`Sh0Q9G_*`) for
   `dsh-client-ui-permission-presets` (`iWlSmW_*`).
4. **WebSocket mux path.** The gateway stream route is now `/api/remote.mux`
   (rc.8 used `/api/events.mux`).
5. **Connection capability.** The web client now declares
   `transport.ownsHost`, so `ctx.connection.isLoopback` is already true through
   the served web app. The rc.8 proxy patch for that handle remains in place
   (it is a no-op on 0.2.x) so an rc.8 rollback keeps working.
6. **Composer input generation.** The Composer textbox is now a contenteditable
   element carrying `role=textbox` and `[data-composer-input]`; rc.8 rendered a
   `<textarea>`. The iOS mobile input-intent hook accepts both generations, and
   `compat/dsh-ui-contract.json` records the new semantic hook.
7. **Multi-entry client module URLs.** The served HTML loads client bundles
   through esbuild-style `/plugins/??pkg-a/client.js,pkg-b/client.js&rev=...`
   URLs. A reverse proxy must forward that raw request target: re-serializing it
   through `new URL()` collapses the second `?` and the candidate 404s every
   client module bundle, so the UI never boots behind the proxy.

### Proxy launch-token bridge

`scripts/start-lan.mjs` captures the upstream launch token from `dsh web`
stdout and passes it to `dsh-remote` as `DSH_UPSTREAM_TOKEN`. The proxy
exchanges it once on loopback, keeps the resulting `dsh-auth-*` cookie in
memory, and attaches it to every forwarded HTTP/WS request (a client-supplied
host cookie still wins). Neither the launch token nor the upstream cookie is
ever sent to a phone or browser, and the proxy's own master/device-token gate
stays the only client-facing credential. Without `DSH_UPSTREAM_TOKEN` the proxy
forwards verbatim, which is the correct behaviour for an rc.8 host.

### Compatibility record

- `compat/dsh-ui-contract.json` records the baseline (`0.1.0-rc.8`), the
  candidate (`0.2.1-alpha.1`), the 39 verified class successors, and the
  semantic hooks the iOS bootstrap depends on (`data-phase`, `aria-selected`,
  `aria-expanded`, `treeitem`, `data-chat-anchor-key`).
- `app/ios/App/App/SceneDelegate.swift` carries both selector generations
  (`:is(.qDHVXG_x, .bhn1Oq_x)`); the embedded-JS gate and the Stable keyboard
  architecture are untouched.
- `node scripts/audit-dsh-compat.mjs --baseline 0.1.0-rc.8 --candidate 0.2.1-alpha.1`
  must report only the documented successor classes, no breaking removals, and
  all semantic hooks retained.
- Unmapped shell selectors (`nL4_yW_sessionLogButton`, `mufS8W_card`) were
  already absent from the rc.8 corpus and degrade gracefully: the optional
  session-log action is simply not offered. This is the only justified
  graceful-degradation exception.

### Live mobile-surface gate (Stable iOS injection)

```bash
node scripts/verify-dsh-mobile-surfaces.mjs
```

The gate extracts `viewportBootstrap`, `mobileLayoutBootstrap`, and
`mobileThemeBootstrap` from `app/ios/App/App/SceneDelegate.swift` — the actual
shipped injection, with no test-only copy — loads the exact 0.2.1-alpha.1 graph
through `dsh-remote` in a real Chromium iPhone viewport, and executes the
scripts at the same document-start / document-end points `WKUserScript` uses.
It then drives the real candidate UI and proves the semantic surfaces Stable
depends on:

- the raw `/plugins/??pkg-a/client.js,pkg-b/client.js&rev=...` multi-entry module
  target survives `dsh-remote` byte-for-byte: every module bundle the live
  candidate requests must return 200, the first observed target is replayed
  through the running proxy with the paired device cookie (200 JavaScript), the
  collapsed `?` control is asserted to 404 so the check stays load-bearing, and
  the ordinary master-token login still redirects to a token-free target;
- frame / sidebar / main resolution (`data-dsh-ios-frame|sidebar|main`);
- a deterministic disposable session fixture: the workspace is chosen through
  the real directory picker into the disposable work directory and a new session
  is created through the real sidebar, leaving an active
  `role="treeitem"[aria-selected="true"]`, with the session-restoring gate
  cleared for a stable hero/active conversation phase;
- Settings open/close, the four expected categories (General, Models, Built-in
  plugins, Agent presets), the General-only current-host entry, and the
  Models-tab state;
- body-portaled menus layered above the iOS drawer (`z=1100 > 1000`): the drawer
  View options menu plus the model / permission / agent-preset Composer menus;
- Composer textbox, add, send, model, permission, and agent-preset controls with
  ~44pt touch targets, and the iOS attachment entry hook
  (`data-dsh-ios-attachment`) applied to the candidate add control;
- documented successor classes (`bhn1Oq_*`, `iWlSmW_*`) resolve in the live DOM
  while the documented graceful degradations (`hHd-Xa_railFish`,
  `nL4_yW_sessionLogButton`, `mufS8W_card`) stay absent and non-blocking.

Isolation matches the candidate verifier: disposable `HOME`/`DSH_HOME`/`XDG_*`/
`TMPDIR`, an independent random proxy master token plus the candidate's own
launch token, and before/after snapshots proving `~/.dsh` and the tracked
worktree are unchanged.

The first run provisions its browser toolchain inside
`$TMPDIR/dsh-mobile-shell-surfaces-runtime` (pinned Playwright 1.59.1, the
Chromium headless shell, and — in minimal containers without a working apt
database — the pinned Ubuntu runtime libraries that build needs). Later runs
reuse that cache, and nothing is ever written inside the repository. When
`proxy/node_modules/playwright` exists (CI installs it), the gate uses it
directly.

### Compatibility repairs found by the gate

1. **Proxy module-URL passthrough.** `dsh-remote` rebuilt every forwarded
   target through `new URL()`, which collapsed the second `?` of the candidate's
   multi-entry module URLs. The candidate then returned 404 for every client
   module bundle and the UI could not boot through the proxy. The proxy now
   preserves the raw request target for `??` module URLs and keeps stripping the
   launch `token` parameter everywhere else. `scripts/verify-dsh-mobile-surfaces.mjs`
   pins both halves explicitly: the live module-bundle responses, a raw replay
   of the observed target plus its collapsed 404 control, and the token-free
   ordinary login redirect. When the proxy does rebuild the target, the gate
   fails with the offending bundle and its HTTP status instead of the generic
   onboarding timeout.
2. **Composer input generation.** The Stable mobile input-intent hook only
   recognized `HTMLTextAreaElement`, so it was dead on the candidate's
   contenteditable Composer. The hook now accepts the contenteditable
   `[data-composer-input]` textbox in addition to the rc.8 `<textarea>`; no
   keyboard/bootstrap architecture changed.

### Candidate verification and isolation

```bash
node scripts/verify-dsh-021-alpha1.mjs                # live paired UI/API/WS/device/proxy checks
node scripts/verify-dsh-021-alpha1.mjs --check-isolation
node scripts/verify-dsh-mobile-surfaces.mjs           # Stable iOS injection against the live candidate
```

The verifier installs the exact graph into a disposable cache directory and
runs the published host with `HOME`, `DSH_HOME`, `XDG_*`, and `TMPDIR` all
inside one `mkdtemp` root. The proxy in front of it gets a fresh random master
token and the candidate's own launch token; no inherited `DSH_REMOTE_TOKEN`,
Stable session, settings file, workspace, or proxy credential is read or
reused. `--check-isolation` additionally asserts, by metadata snapshot, that
`~/.dsh` and the tracked worktree are byte-identical before and after the run,
that the candidate created its own credentials and workspace inside the
disposable root, and that rollback is documented.

### Rollback

Rollback is a pointer change, never a migration:

1. keep the rc.8 host directory in place (it is the Stable host and the
   rollback source; the candidate never writes to it);
2. point the proxy back at it (`DSH_TARGET_PORT`, or `DSH_BIN`/npx pin back to
   the rc.8 release for the launcher);
3. unset `DSH_UPSTREAM_TOKEN` — an rc.8 host has no browser authentication, so
   the bridge stays disarmed;
4. delete the candidate install/state directories if desired; no Stable
   session, setting, credential, or workspace data was migrated into them.

## Runtime compatibility policy

Operational DOM queries should go through the small `dshCompat` selector registry inside `mobileLayoutBootstrap` rather than adding new one-off `document.querySelector('.privateClass')` calls.

Priority for new selectors:

```text
stable data-* / aria / role
-> structural/semantic relationship
-> upstream private CSS-module class as fallback
```

CSS still contains Stable-era private-class selectors. Do not bulk-rewrite those during an upstream upgrade. The static audit exists to catch drift before a host is promoted; migrate CSS incrementally only when a real upstream change requires it.

## Promotion gate

For every candidate DSH version:

1. Generate an exact-version candidate manifest.
2. Run `scripts/audit-dsh-compat.mjs`.
3. Start the candidate on a separate port/host. Do not replace Stable.
4. Verify the semantic surfaces:
   - shell/frame/sidebar/main
   - Session restore
   - Session list / Workspace switching
   - Settings open/close and all menu portals
   - model / permission / Agent preset selectors
   - Composer input / add / send
   - attachment entry and drop path
   `node scripts/verify-dsh-mobile-surfaces.mjs` automates this pass with the
   shipped iOS injection on a disposable candidate fixture.
5. Run the existing iOS static gate.
6. Run the true-device gate from `IOS-STABLE-BASELINE.md` when the candidate changes a UI surface used by iOS.
7. Promote candidate -> Stable host only after all relevant gates pass.

If a candidate breaks a cosmetic capability, prefer graceful degradation over changing the native keyboard/bootstrap architecture. If a core capability cannot be resolved, keep the previous Stable host and update only the compatibility adapter.
