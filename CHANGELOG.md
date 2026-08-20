# Changelog

All notable user-facing changes to `dsh-mobile-shell` are recorded here.

The project follows [Semantic Versioning](https://semver.org/). Historical development commits may be compacted; release tags are the stable comparison and rollback points.

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
