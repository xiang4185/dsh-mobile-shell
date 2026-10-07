#!/usr/bin/env node
/**
 * Checks for the one-command LAN launcher (scripts/start-lan.mjs).
 *
 * Static assertions (always): private-LAN selection, the exact 0.2.1-alpha.1
 * pin, DSH_BIN version gating, upstream launch-token parsing, and the LAN-only
 * proxy environment.
 *
 * Hermetic integration (when the machine exposes a private LAN IPv4): a stub
 * `dsh` binary stands in for the pinned release, the real launcher is started,
 * a phone-style pairing code is consumed from the launcher's printed pairing
 * link, and the paired session must reach the host UI through the proxy —
 * proving the upstream launch-token handoff. Both spawned ports must be
 * released after SIGTERM, proving process-tree teardown. No network needed.
 *
 * Live integration (opt-in, DSH_START_LAN_LIVE=1): the same flow against the
 * real published release via npx. CI runs this against the pinned version.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  DSH_RELEASE,
  buildProxyEnv,
  listPrivateLanIPv4,
  parseUpstreamLaunchToken,
  resolveDshCommand,
  shutdownChildren,
  stopTree,
} from './start-lan.mjs'

const REPO = fileURLToPath(new URL('../', import.meta.url))

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

// ── static: private LAN selection ────────────────────────────────────────
const interfaces = {
  en0: [
    { address: '192.168.1.23', family: 'IPv4', internal: false },
    { address: 'fe80::1', family: 'IPv6', internal: false },
  ],
  utun0: [{ address: '10.8.0.2', family: 'IPv4', internal: false }],
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
}
const candidates = listPrivateLanIPv4(interfaces)
expect(candidates.map((entry) => entry.address).join(',') === '192.168.1.23,10.8.0.2',
  `unexpected LAN candidates: ${JSON.stringify(candidates)}`)
console.log('ok   private LAN candidate ranking')

// ── static: exact release pin ────────────────────────────────────────────
expect(DSH_RELEASE === '@deepseek-ai/dsh@0.2.1-alpha.1', `unexpected release pin: ${DSH_RELEASE}`)
const defaultCommand = resolveDshCommand({})
expect(/(?:^|\/)npx(?:\.cmd)?$/.test(defaultCommand.command), `default command is not npx: ${defaultCommand.command}`)
expect(defaultCommand.args.join(' ') === `--yes ${DSH_RELEASE}`, `unpinned npx args: ${JSON.stringify(defaultCommand.args)}`)
expect(!defaultCommand.pinned, 'npx path must not be reported as a verified binary')
console.log('ok   launcher pins exactly @deepseek-ai/dsh@0.2.1-alpha.1')

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-start-lan-check-'))
const versionStub = (reported) => {
  const file = path.join(workdir, `stub-version-${crypto.randomUUID()}.mjs`)
  fs.writeFileSync(file, `#!/usr/bin/env node\nconsole.log(${JSON.stringify(reported)})\n`, { mode: 0o755 })
  return file
}
assert.throws(() => resolveDshCommand({ DSH_BIN: versionStub('0.1.0-rc.8') }),
  /DSH_BIN must be @deepseek-ai\/dsh@0\.2\.1-alpha\.1/)
const verified = resolveDshCommand({ DSH_BIN: versionStub('0.2.1-alpha.1') })
expect(verified.pinned === true && verified.args.length === 0, 'verified DSH_BIN must be used verbatim')
console.log('ok   DSH_BIN override is refused unless --version reports the pinned release')

// ── static: upstream token parsing and proxy environment ─────────────────
const launchLine = 'dsh web: http://127.0.0.1:3080/?token=AbC-123_xyz (LAN: http://192.168.1.5:3080/?token=AbC-123_xyz)'
expect(parseUpstreamLaunchToken(launchLine) === 'AbC-123_xyz',
  `launch token parse failed: ${parseUpstreamLaunchToken(launchLine)}`)
expect(parseUpstreamLaunchToken('no url here') === undefined, 'token parser must fail closed')
const proxyEnv = buildProxyEnv(
  { PATH: '/usr/bin', DSH_PUBLIC_URL: 'https://public.example/', DSH_TLS_CERT: 'x', DSH_TLS_KEY: 'y', DSH_LAUNCHER: 'off', NO_COLOR: '1' },
  { masterToken: 'm'.repeat(32), upstreamToken: 'launch-token', lanIp: '10.1.2.3', listenPort: 3081, targetPort: 3080 },
)
expect(proxyEnv.DSH_REMOTE_TOKEN === 'm'.repeat(32), 'master token missing')
expect(proxyEnv.DSH_UPSTREAM_TOKEN === 'launch-token', 'upstream launch token was not handed to the proxy')
expect(proxyEnv.DSH_LISTEN_HOST === '10.1.2.3', 'proxy did not bind the private LAN address')
for (const cleared of ['DSH_PUBLIC_URL', 'DSH_TLS_CERT', 'DSH_TLS_KEY', 'DSH_LAUNCHER', 'NO_COLOR']) {
  expect(proxyEnv[cleared] === undefined, `${cleared} leaked into the LAN proxy environment`)
}
console.log('ok   launch token handoff and LAN-only proxy environment')

// ── integration ──────────────────────────────────────────────────────────
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function portReleased(host, port, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  const attempt = () => new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let settled = false
    const finish = (open) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(300, () => finish(false))
  }).then((open) => {
    if (!open) return true
    if (Date.now() >= deadline) return false
    return new Promise((resolve) => setTimeout(resolve, 150)).then(attempt)
  })
  return attempt()
}

async function fetchOk(url, options, timeoutMs = 5_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

const STUB_HOST = `#!/usr/bin/env node
import http from 'node:http'
const args = process.argv.slice(2)
if (args.includes('--version')) { console.log('0.2.1-alpha.1'); process.exit(0) }
const portIndex = args.indexOf('--port')
const port = Number(portIndex >= 0 ? args[portIndex + 1] : 3080)
const token = 'stub-launch-token-0123456789abcdef'
const cookieName = 'dsh-auth-stub'
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://stub.invalid')
  const cookie = req.headers.cookie ?? ''
  const session = cookie.split(';').some((part) => part.trim().startsWith(cookieName + '='))
  if (url.pathname === '/' && url.searchParams.get('token') === token) {
    res.writeHead(303, { location: './', 'set-cookie': cookieName + '=v1; Path=/; HttpOnly; SameSite=Strict' })
    res.end()
    return
  }
  if (!session) { res.writeHead(401, { 'content-type': 'text/plain' }); res.end('dsh web authentication required'); return }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<html><head><title>DeepSeek Harness stub</title></head><body>stub host ui</body></html>')
    return
  }
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ type: 'server-response', rpcId: 'stub', result: { ok: true, value: { namespaces: ['stub'] } } }))
    return
  }
  res.writeHead(404); res.end()
})
server.listen(port, '127.0.0.1', () => { console.log('dsh web: http://127.0.0.1:' + port + '/?token=' + token) })
`

async function runIntegration({ live }) {
  const lanIp = process.env.DSH_LAN_IP_OVERRIDE ?? listPrivateLanIPv4()[0]?.address
  if (lanIp === undefined) {
    console.log('skip launcher integration — no private LAN IPv4 address on this machine')
    return
  }
  const targetPort = await freePort()
  const listenPort = await freePort()
  const tokenBudget = live ? '300000' : '30000'
  let bin
  if (live) {
    console.log(`note: live launcher integration via npx ${DSH_RELEASE} (may download the release)`)
  } else {
    bin = path.join(workdir, 'stub-dsh.mjs')
    fs.writeFileSync(bin, STUB_HOST, { mode: 0o755 })
  }

  const launcher = spawn(process.execPath, [path.join(REPO, 'scripts/start-lan.mjs')], {
    cwd: REPO,
    env: {
      ...process.env,
      ...(bin === undefined ? {} : { DSH_BIN: bin }),
      DSH_LAN_IP: lanIp,
      DSH_TARGET_PORT: String(targetPort),
      DSH_LISTEN_PORT: String(listenPort),
      DSH_START_LAN_TOKEN_TIMEOUT_MS: tokenBudget,
      DSH_PAIR_QR: 'off',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  let output = ''
  launcher.stdout.on('data', (chunk) => { output += chunk.toString('utf8') })
  launcher.stderr.on('data', (chunk) => { output += chunk.toString('utf8') })

  try {
    const deadline = Date.now() + (live ? 360_000 : 60_000)
    let reachable = false
    while (Date.now() < deadline) {
      if (launcher.exitCode !== null) throw new Error(`launcher exited early:\n${output}`)
      try {
        const response = await fetchOk(`http://${lanIp}:${listenPort}/healthz`, {})
        await response.body?.cancel()
        reachable = response.status === 200
        if (reachable) break
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    expect(reachable, `launcher proxy never became reachable:\n${output}`)
    expect(output.includes('captured the upstream launch token'), 'launcher did not report the upstream launch-token handoff')
    expect(output.includes('upstream launch-token bridge armed'),
      'proxy did not receive DSH_UPSTREAM_TOKEN through the launcher environment')
    if (!live) {
      expect(output.includes('using verified @deepseek-ai/dsh@0.2.1-alpha.1'),
        `launcher did not report the verified pin:\n${output}`)
    }

    // Phone-style flow: the pairing code comes from the launcher's own printed
    // pairing link (the master token never leaves the launcher).
    const pairLink = /pairing link (\S+#pair=(\d{6}))/.exec(output)
    expect(pairLink, `launcher did not print a pairing link:\n${output}`)
    const paired = await fetchOk(`http://${lanIp}:${listenPort}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pairLink[2] }),
    })
    expect(paired.status === 200, `pairing failed: HTTP ${paired.status}`)
    const cookie = (paired.headers.getSetCookie() ?? [])
      .map((entry) => entry.split(';', 1)[0])
      .find((entry) => entry.startsWith('dsh_token='))
    expect(cookie, 'pairing did not return a dsh_token cookie')

    const ui = await fetchOk(`http://${lanIp}:${listenPort}/`, { headers: { cookie } })
    const html = await ui.text()
    expect(ui.status === 200, `paired UI through the launcher failed: HTTP ${ui.status}`)
    expect(/DeepSeek Harness/.test(html), 'paired UI did not come from the host')
    expect(html.includes('data-dsh-remote-random-uuid-polyfill'), 'LAN crypto shim missing from the paired UI')

    const api = await fetchOk(`http://${lanIp}:${listenPort}/api/settings/describe`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'start-lan', method: 'settings/describe', payload: { args: {} } }),
    })
    const envelope = await api.json()
    expect(api.status === 200 && envelope.result?.ok === true,
      `authenticated API through the launcher failed: HTTP ${api.status} ${JSON.stringify(envelope).slice(0, 200)}`)
    console.log(`ok   ${live ? 'live' : 'hermetic'} launcher integration: paired UI and authenticated API through the pinned host`)
  } finally {
    // Signal the launcher exactly like Ctrl-C and require its whole tree to die.
    stopTree(launcher, 'SIGTERM')
    await new Promise((resolve) => {
      if (launcher.exitCode !== null) return resolve()
      const timer = setTimeout(resolve, 8_000)
      launcher.once('exit', () => { clearTimeout(timer); resolve() })
    })
    if (launcher.exitCode === null) {
      stopTree(launcher, 'SIGKILL')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    await shutdownChildren([launcher])
  }

  expect(await portReleased('127.0.0.1', targetPort), `dsh host still listening on ${targetPort} after shutdown`)
  expect(await portReleased(lanIp, listenPort), `proxy still listening on ${lanIp}:${listenPort} after shutdown`)
  console.log('ok   launcher shutdown released both the host and proxy ports')
}

try {
  // LAN-only guard stays enforced on the real entrypoint.
  const refused = spawn(process.execPath, [path.join(REPO, 'scripts/start-lan.mjs')], {
    cwd: REPO,
    env: { ...process.env, DSH_TLS_CERT: '/nonexistent.pem', DSH_TLS_KEY: '/nonexistent.key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let refusal = ''
  refused.stdout.on('data', (chunk) => { refusal += chunk })
  refused.stderr.on('data', (chunk) => { refusal += chunk })
  const refusalCode = await new Promise((resolve) => refused.once('exit', resolve))
  expect(refusalCode === 1, `start-lan accepted TLS configuration (exit ${refusalCode})`)
  expect(refusal.includes('LAN-only'), `missing LAN-only refusal: ${refusal}`)
  console.log('ok   start-lan refuses public/TLS configuration')

  await runIntegration({ live: process.env.DSH_START_LAN_LIVE === '1' })
} finally {
  fs.rmSync(workdir, { recursive: true, force: true })
}

console.log('\nall secure LAN launcher checks passed')
