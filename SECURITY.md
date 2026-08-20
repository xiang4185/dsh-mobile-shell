# Security Policy

`dsh-mobile-shell` sits in front of DeepSeek Harness, which can access high-privilege tools and files on the host. Treat remote-access configuration as security-sensitive.

## Supported versions

Security fixes are targeted at the latest Stable release. Users should upgrade to the newest published version before reporting a problem that may already have been fixed.

## Reporting a vulnerability

Prefer GitHub's **private vulnerability reporting / Security Advisory** flow for this repository when it is available.

If private reporting is not available, open a minimal public issue asking the maintainer to establish a private channel. **Do not include exploit details, credentials, tokens, private URLs, hostnames, or personal network information in that issue.**

Please include privately:

- affected release and DSH version;
- affected component (`proxy`, browser launcher, Android, iOS, pairing, etc.);
- reproduction steps;
- expected and actual behavior;
- impact assessment;
- any proposed mitigation.

## Deployment model

The intended trust boundary is:

```text
client
  -> dsh-remote authentication boundary
  -> dsh web bound to loopback
```

Recommended deployment rules:

- Keep `dsh web` bound to loopback.
- Never expose the upstream DSH Web server directly to the public Internet.
- Generate a strong random `DSH_REMOTE_TOKEN`; never commit it to source control.
- Do not place master tokens in URLs, screenshots, frontend source, analytics, or normal Web Storage.
- Use plain HTTP only on a trusted LAN or private overlay network.
- For public access, use HTTPS/WSS with a certificate issued by a trusted CA.
- Protect the host itself with normal OS access controls and least privilege.
- Rotate the master token if a device credential or deployment secret may have been exposed.

## Authentication model

The proxy supports one-time pairing codes and scoped device credentials. Browser sessions use HttpOnly cookies; device credentials cannot mint additional pairing codes. HTTP requests and WebSocket upgrades pass through the same authentication boundary.

The proxy is not a substitute for host hardening. Any authenticated user who can operate Harness may reach tools with the permissions granted to the Harness process.

## Secrets in bug reports and logs

Before sharing diagnostics, remove:

- `DSH_REMOTE_TOKEN` values;
- device tokens and cookies;
- pairing codes that are still valid;
- public tunnel URLs tied to a private deployment;
- local usernames and absolute home paths;
- private IP addresses and internal hostnames;
- workspace or file contents that are not intended to be public.
