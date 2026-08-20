# Documentation

This directory contains architecture notes, accepted decisions, compatibility guidance, release audits, and historical implementation records.

For normal installation and usage, start with the root [`README.md`](../README.md) or [`README.zh.md`](../README.zh.md).

## Current maintainer documentation

| Document | Purpose |
|---|---|
| [`../IOS-STABLE-BASELINE.md`](../IOS-STABLE-BASELINE.md) | iOS stable architecture, regression constraints, and true-device gate |
| [`../KNOWN-ISSUES.md`](../KNOWN-ISSUES.md) | Current non-blocking known issues |
| [`DSH-UPGRADE-COMPAT.md`](DSH-UPGRADE-COMPAT.md) | Controlled DSH upstream upgrade / candidate-host process |
| [`RELEASE-1.1.1-AUDIT.md`](RELEASE-1.1.1-AUDIT.md) | v1.1.1 release audit and validation record |
| [`02-build-and-dependencies.md`](02-build-and-dependencies.md) | Build requirements and dependency notes |
| [`10-roadmap-to-release.md`](10-roadmap-to-release.md) | Roadmap and deferred work |

## Architecture Decision Records

Accepted architectural decisions live in [`decisions/`](decisions/):

| ADR | Decision |
|---|---|
| [ADR-0001](decisions/ADR-0001-docs-and-process.md) | Documentation and decision-record process |
| [ADR-0002](decisions/ADR-0002-architecture-remote-client.md) | Remote-client architecture rather than running Harness on-device |
| [ADR-0003](decisions/ADR-0003-mobile-ui-out-of-tree-plugin.md) | Historical out-of-tree mobile UI approach |
| [ADR-0004](decisions/ADR-0004-token-proxy.md) | Authenticated proxy while DSH remains loopback-only |
| [ADR-0005](decisions/ADR-0005-ios-vendored-capacitor-spm.md) | Vendored Capacitor SPM for reproducible iOS builds |
| [ADR-0006](decisions/ADR-0006-pairing-code-and-tls.md) | Pairing codes and user-supplied trusted TLS |
| [ADR-0007](decisions/ADR-0007-web-mode-launcher.md) | Browser launcher / zero-install Web mode |
| [ADR-0008](decisions/ADR-0008-device-session-and-web-hardening.md) | Scoped device sessions and Web hardening |
| [ADR-0009](decisions/ADR-0009-web-qr-pairing.md) | One-time QR pairing flow |

Accepted ADRs should not be silently rewritten when a decision changes. Add a new ADR and mark the earlier one superseded.

## Historical implementation records

The numbered documents below capture the project's investigation and implementation history. They are useful for context, but **current README, Stable baseline, ADRs, and compatibility docs take precedence if instructions differ.**

| Document | Historical scope |
|---|---|
| [`01-project-analysis.md`](01-project-analysis.md) | Initial upstream architecture analysis |
| [`03-feasibility-analysis.md`](03-feasibility-analysis.md) | Early mobile architecture options |
| [`04-mobile-ui-plugin.md`](04-mobile-ui-plugin.md) | Earlier mobile UI plugin investigation |
| [`05-phase1-poc.md`](05-phase1-poc.md) | Phase 1 shell / proxy PoC |
| [`06-phase2-pairing-tls.md`](06-phase2-pairing-tls.md) | Pairing and optional TLS implementation |
| [`07-real-device-verification.md`](07-real-device-verification.md) | Historical real-device verification plan and records |
| [`08-web-mode.md`](08-web-mode.md) | Browser Web-mode implementation |
| [`09-web-security-hardening.md`](09-web-security-hardening.md) | Proxy / browser security-hardening validation |
| [`11-web-qr-pairing.md`](11-web-qr-pairing.md) | QR pairing implementation and validation |

## Documentation rules

- Do not include credentials, active pairing codes, personal IP addresses, private hostnames, local usernames, or absolute home-directory paths.
- Use placeholders such as `<host>`, `<private-lan-ip>`, `<token>`, and `<repository-url>` in examples.
- Distinguish current operational guidance from historical test records.
- Public behavior, security boundaries, and compatibility contracts should be documented when they change.
- Release tags are the durable comparison points; temporary diagnostic commit hashes should not be used as long-term documentation references.
