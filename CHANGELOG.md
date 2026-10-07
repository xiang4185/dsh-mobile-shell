# Changelog

All notable user-facing changes to `dsh-mobile-shell` are recorded here.

The project follows [Semantic Versioning](https://semver.org/). Historical development commits may be compacted; release tags are the stable comparison and rollback points.

## [Unreleased]

### Added

- Isolated candidate verifier `scripts/verify-dsh-021-alpha1.mjs`: runs the published `@deepseek-ai/dsh@0.2.1-alpha.1` host with disposable `HOME`/`DSH_HOME`/`XDG_*`/`TMPDIR` and an independent proxy credential, then checks paired UI, release-valid authenticated API, WebSocket mux, device sessions, same-origin, and proxy fences. `--check-isolation` proves the Stable `~/.dsh` data path and the tracked worktree are unchanged and prints the rollback behavior.
- `DSH_UPSTREAM_TOKEN` handoff in `dsh-remote`: the one-command LAN launcher captures the 0.2.x host launch token, the proxy exchanges it on loopback, and the upstream browser-session cookie stays in proxy memory.
- Compatibility contract records the 0.2.1-alpha.1 class successors (`qDHVXG_* -> bhn1Oq_*`, `Sh0Q9G_* -> iWlSmW_*`), the candidate-only packages, and the semantic DOM hooks the iOS bootstrap depends on.

### Changed

- The LAN launcher starts exactly `@deepseek-ai/dsh@0.2.1-alpha.1` (or a `DSH_BIN` whose `--version` matches), verifies the pin, and tears down the whole spawned process tree.
- The candidate graph tool defaults to the pinned release, verifies an installed graph for mixed DSH prereleases, and the compat audit supports documented successor classes and semantic hooks.
- The iOS mobile bootstrap carries both selector generations (`:is(.qDHVXG_x, .bhn1Oq_x)`) so the shell styles and hit targets resolve on rc.8 and 0.2.1-alpha.1 without changing the Stable keyboard/bootstrap architecture.

## [1.1.1] - 2026-08-20

### Added

- DSH UI Compatibility Layer and static contract audit for controlled upstream upgrades.
- Deterministic candidate dependency generation for DSH prerelease package graphs.
- Authenticated proxy compatibility bridge for DSH rc.8 Settings access.
- Public maintenance documentation for the iOS stable baseline and known issues.

### Changed

- Validated and promoted DSH `0.1.0-rc.8` as the tested Stable Host baseline.
- Composer input intent on iPhone now returns the conversation to the latest message and keeps it bottom-pinned while the keyboard changes the native viewport.
- iOS attachment picker now reflects the upstream image-only attachment contract.
- Simplified Composer model / Agent preset visual chrome while preserving mobile hit targets.

### Fixed

- Model Settings access through the authenticated remote proxy on DSH rc.8.
- Near-bottom reader positioning during repeated keyboard viewport changes.

### Known issue

- On iOS, the software keyboard may remain visible after a successful message send. See [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md).

## [1.1.0] - 2026-08-19

### Added

- Stable iOS mobile shell with native keyboard viewport handling.
- Mobile Drawer, Settings, Composer, loading, session-restore, and pairing refinements.
- Unsigned iOS device IPA artifact in the release pipeline.

### Fixed

- Settings popup portal stacking.
- Startup focus / keyboard flash and session-restore visual flash.
- Mobile interaction hit targets and reader positioning regressions.

## [1.0.0] - 2026-08-16

### Added

- Versioned Android, iOS, and Web release artifacts.
- Isolated Web artifact packaging and verification.
- Authenticated proxy, device sessions, QR pairing, and browser launcher flow.

Earlier versions document the initial proxy, pairing, Web-mode, and proof-of-concept stages. See the formal Git tags for archival snapshots.
