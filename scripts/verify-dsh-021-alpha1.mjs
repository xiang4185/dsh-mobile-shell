#!/usr/bin/env node
/**
 * Live verification of the published DSH 0.2.1-alpha.1 candidate host.
 *
 * Starts an exact-graph install of @deepseek-ai/dsh@0.2.1-alpha.1 on loopback
 * with disposable state and one dsh-remote instance in front of it, then
 * proves the candidate really serves the mobile shell's contract:
 *
 *   - paired UI (launcher pairing -> device cookie -> real DeepSeek Harness UI)
 *   - release-valid authenticated API (POST /api/settings/describe envelope)
 *   - WebSocket mux (/api/remote.mux: 403 without, 101 with a device cookie)
 *   - device sessions (down-scoped cookie, no master leak, tamper/single-use)
 *   - same-origin and proxy security fences (401/403/400/413 behaviour)
 *
 * Isolation (always, and the focus of --check-isolation):
 *   - candidate host runs with HOME/DSH_HOME/XDG/TMPDIR inside one disposable
 *     root, so the Stable rc.8 home (~/.dsh: sessions, settings, credentials)
 *     is never read for state, migrated, or written;
 *   - the proxy uses a randomly generated master token and the candidate's own
 *     launch token, never an inherited DSH_REMOTE_TOKEN;
 *   - before/after snapshots prove ~/.dsh and the tracked worktree are
 *     unchanged by the run;
 *   - runs print the documented rollback: keep the rc.8 host directory and
 *     point DSH_TARGET_PORT back at it — no candidate state is migrated.
 *
 * Usage:
 *   node scripts/verify-dsh-021-alpha1.mjs [--check-isolation] [--keep-state]
 *
 * Env: DSH_CANDIDATE_DIR (reuse an exact install), DSH_VERIFY_NODE_BIN.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { shutdownChildren, stopTree } from './start-lan.mjs'
import { verifyExactGraph } from './lib/dsh-graph.mjs'
import {
  CANDIDATE_VERSION,
  STABLE_HOME,
  candidateHostEnv,
  candidateProxyEnv,
  candidateRootDir,
  cookieHeader,
  createDisposableRoot,
  ensureCandidateInstall,
  freePort,
  gitState,
  randomMasterToken,
  snapshotTree,
  waitForHttp,
  waitForLaunchToken,
} from './lib/dsh-candidate.mjs'

export { CANDIDATE_VERSION }

const REPO = fileURLToPath(new URL('../', import.meta.url))

const args = process.argv.slice(2)
let checkIsolation = false
let keepState = false
for (const arg of args) {
  if (arg === '--check-isolation') checkIsolation = true
  else if (arg === '--keep-state') keepState = true
  else if (arg === '--help' || arg === '-h') {
    console.log('usage: node scripts/verify-dsh-021-alpha1.mjs [--check-isolation] [--keep-state]')
    process.exit(0)
  } else {
    throw new Error(`unknown argument: ${arg}`)
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
function ok(name) {
  console.log(`ok   ${name}`)
}

// ── WS helper ────────────────────────────────────────────────────────────
function wsHandshakeStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const socket = net.connect(Number(target.port), target.hostname)
    const lines = Object.entries({
      host: target.host,
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-websocket-version': '13',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      ...headers,
    }).map(([key, value]) => `${key}: ${value}`).join('\r\n')
    socket.write(`GET ${target.pathname} HTTP/1.1\r\n${lines}\r\n\r\n`)
    let data = ''
    socket.on('data', (chunk) => {
      data += chunk
      const match = /^HTTP\/1\.1 (\d+)/.exec(data)
      if (match) {
        socket.destroy()
        resolve(Number(match[1]))
      }
    })
    socket.on('error', reject)
    socket.setTimeout(8_000, () => {
      socket.destroy()
      reject(new Error('ws handshake timeout'))
    })
  })
}

// ── main ─────────────────────────────────────────────────────────────────
const binPath = ensureCandidateInstall(candidateRootDir(), {
  repo: REPO,
  label: 'dsh-021-alpha1',
  verifyExactGraph,
})
const { packages, mismatch } = verifyExactGraph(candidateRootDir(), CANDIDATE_VERSION)
expect(packages.length > 0, 'candidate graph is empty')
expect(mismatch.length === 0,
  `mixed DSH prerelease stack detected: ${mismatch.slice(0, 5).map((entry) => `${entry.name}@${entry.version}`).join(', ')}`)
console.log(`ok   exact candidate graph: ${packages.length}/${packages.length} @deepseek-ai/dsh* packages at ${CANDIDATE_VERSION}`)

const { root, homeDir, stateDir, workDir, tmpDir } = createDisposableRoot('dsh-021-alpha1-verify-')

const hostPort = await freePort()
const proxyPort = await freePort()
const masterToken = randomMasterToken()
const stableBefore = snapshotTree(STABLE_HOME)
const gitBefore = gitState(REPO)
const runStart = Date.now()

const hostEnv = candidateHostEnv({ homeDir, stateDir, tmpDir })

const children = []
let upstreamHost
let proxy
try {
  upstreamHost = spawn(process.execPath, [binPath, 'web', '--no-open', '--port', String(hostPort)], {
    cwd: workDir,
    env: hostEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  children.push(upstreamHost)
  const { token: launchToken } = await waitForLaunchToken(upstreamHost, { timeoutMs: 90_000 })
  console.log(`ok   published ${CANDIDATE_VERSION} host started on 127.0.0.1:${hostPort} (isolated DSH_HOME)`)
  await waitForHttp(`http://127.0.0.1:${hostPort}/`, 30_000)

  proxy = spawn(process.execPath, [path.join(REPO, 'proxy', 'dsh-remote.mjs')], {
    cwd: REPO,
    env: candidateProxyEnv({ homeDir, stateDir, masterToken, upstreamToken: launchToken, hostPort, proxyPort }),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  children.push(proxy)
  let proxyOutput = ''
  proxy.stdout.on('data', (chunk) => { proxyOutput += chunk.toString('utf8') })
  proxy.stderr.on('data', (chunk) => { proxyOutput += chunk.toString('utf8') })
  const PROXY = `http://127.0.0.1:${proxyPort}`
  await waitForHttp(`${PROXY}/healthz`, 30_000)
  ok('dsh-remote started in front of the candidate with an independent random master token')

  // ── R4: proxy security fences ──────────────────────────────────────────
  let response = await fetch(`${PROXY}/api/settings/describe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  expect(response.status === 401, `unauthenticated /api must be 401, got ${response.status}`)
  await response.body?.cancel()

  response = await fetch(`${PROXY}/healthz`)
  expect(response.status === 200 && response.headers.get('access-control-allow-origin') === '*',
    `healthz must be 200 with ACAO:*, got ${response.status}`)
  await response.body?.cancel()

  response = await fetch(`${PROXY}/`, { redirect: 'manual' })
  const launcher = await response.text()
  expect(response.status === 200 && launcher.includes('dsh-remote launcher'), 'unauthenticated / must serve the launcher page')
  expect((response.headers.get('content-security-policy') ?? '').includes("default-src 'none'"), 'launcher CSP missing')
  expect(!launcher.includes(launchToken), 'launcher page leaked the upstream launch token')
  ok('proxy security: launcher face, CSP, and unauthenticated API rejection')

  const malformedHost = await new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1')
    socket.write('GET / HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n')
    let data = ''
    socket.on('data', (chunk) => {
      data += chunk
      const match = /^HTTP\/1\.1 (\d+)/.exec(data)
      if (match) {
        socket.destroy()
        resolve(Number(match[1]))
      }
    })
    socket.on('error', reject)
    socket.setTimeout(5_000, () => { socket.destroy(); reject(new Error('malformed host probe timed out')) })
  })
  expect(malformedHost === 400, `malformed Host must be 400, got ${malformedHost}`)
  ok('proxy security: malformed Host rejected with 400')

  // ── R4: pairing, device session, paired UI ─────────────────────────────
  response = await fetch(`${PROXY}/?token=${encodeURIComponent(masterToken)}`, { redirect: 'manual' })
  expect(response.status === 302, `master login must redirect, got ${response.status}`)
  const masterCookie = (response.headers.getSetCookie() ?? []).join('; ')
  expect(masterCookie.includes('HttpOnly'), 'session cookie is not HttpOnly')
  expect(!masterCookie.includes(masterToken), 'master token was persisted in the browser cookie')
  const session = cookieHeader(response)
  expect(session, 'master login did not set a device cookie')
  const deviceToken = session.cookie.slice('dsh_token='.length)
  expect(deviceToken.startsWith('dshd1.'), `unexpected device token: ${deviceToken.slice(0, 12)}`)
  ok('paired session: master login down-scopes to an HttpOnly device cookie')

  response = await fetch(`${PROXY}/`, { headers: session })
  const ui = await response.text()
  expect(response.status === 200, `paired UI must be 200, got ${response.status}`)
  expect(ui.includes('DeepSeek Harness'), 'paired UI is not the DeepSeek Harness document')
  expect(ui.includes('data-dsh-remote-random-uuid-polyfill'), 'LAN crypto.randomUUID shim missing from the paired UI')
  expect(!ui.includes(launchToken), 'paired UI response leaked the upstream launch token')
  ok('paired UI: real candidate document served through dsh-remote')

  // ── R4: release-valid authenticated API ────────────────────────────────
  response = await fetch(`${PROXY}/api/settings/describe`, {
    method: 'POST',
    headers: { ...session, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'verify-1', method: 'settings/describe', payload: { args: {} } }),
  })
  expect(response.status === 200, `authenticated /api/settings/describe must be 200, got ${response.status}`)
  const envelope = await response.json()
  expect(envelope.type === 'server-response' && envelope.rpcId === 'verify-1',
    `unexpected RPC envelope: ${JSON.stringify(envelope).slice(0, 200)}`)
  expect(envelope.result?.ok === true,
    `candidate rejected the release-valid API call: ${JSON.stringify(envelope.result).slice(0, 300)}`)
  const namespaces = envelope.result.value?.namespaces
  expect(Array.isArray(namespaces) && namespaces.length > 0 && namespaces.every((entry) => typeof entry.ns === 'string'),
    `settings describe returned no namespaces: ${JSON.stringify(envelope.result.value).slice(0, 300)}`)
  ok(`release-valid API: settings/describe ok:true with ${namespaces.length} namespaces`)

  // ── R4: WebSocket mux ──────────────────────────────────────────────────
  const wsPath = '/api/remote.mux'
  expect(await wsHandshakeStatus(`${PROXY}${wsPath}`, {}) === 403, 'WS handshake without a token must be 403')
  expect(await wsHandshakeStatus(`${PROXY}${wsPath}`, session) === 101, 'WS handshake with a device cookie must be 101')
  ok('WebSocket: /api/remote.mux rejects anonymous and admits the paired device session')

  // ── R4: device-session and same-origin fencing ─────────────────────────
  const [prefix, payload, signature] = deviceToken.split('.')
  const tampered = `${prefix}.${payload}.${(signature[0] === 'A' ? 'B' : 'A') + signature.slice(1)}`
  response = await fetch(`${PROXY}/api/settings/describe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tampered}`, 'content-type': 'application/json' },
    body: '{}',
  })
  expect(response.status === 401, `tampered device token must be 401, got ${response.status}`)
  await response.body?.cancel()

  response = await fetch(`${PROXY}/pair/new`, { method: 'POST', headers: session })
  expect(response.status === 401, `device session must not mint pairing codes, got ${response.status}`)
  await response.body?.cancel()

  response = await fetch(`${PROXY}/api/settings/describe`, {
    method: 'POST',
    headers: { ...session, 'content-type': 'application/json', origin: 'https://attacker.invalid' },
    body: '{}',
  })
  expect(response.status === 403, `cross-origin API request must be 403, got ${response.status}`)
  await response.body?.cancel()
  expect(await wsHandshakeStatus(`${PROXY}${wsPath}`, { ...session, origin: 'https://attacker.invalid' }) === 403,
    'cross-origin WS handshake must be 403')
  ok('device sessions: tamper rejection, no pairing-code minting, same-origin fence on API and WS')

  response = await fetch(`${PROXY}/api/settings/describe`, {
    method: 'POST',
    headers: { ...session, 'content-type': 'application/json', origin: PROXY },
    body: JSON.stringify({ type: 'client-request', rpcId: 'verify-2', method: 'settings/describe', payload: { args: {} } }),
  })
  const sameOrigin = await response.json()
  expect(response.status === 200 && sameOrigin.result?.ok === true,
    `same-origin API request must pass: HTTP ${response.status}`)
  ok('same-origin: paired browser origin passes the proxy fence and reaches the candidate')

  // ── R4: pairing fences ─────────────────────────────────────────────────
  const mint = await fetch(`${PROXY}/pair/new`, { method: 'POST', headers: { authorization: `Bearer ${masterToken}` } })
  expect(mint.status === 200, `master token must mint pairing codes, got ${mint.status}`)
  const { code } = await mint.json()
  expect(/^\d{6}$/.test(code), `unexpected pairing code: ${code}`)

  response = await fetch(`${PROXY}/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: code === '999999' ? '888888' : '999999' }),
  })
  expect(response.status === 403, `wrong pairing code must be 403, got ${response.status}`)
  await response.body?.cancel()

  const redeemed = await fetch(`${PROXY}/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  expect(redeemed.status === 200, `pairing code redemption must be 200, got ${redeemed.status}`)
  await redeemed.body?.cancel()

  const replay = await fetch(`${PROXY}/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  expect(replay.status === 403, `redeemed pairing code must be single-use, got ${replay.status}`)
  await replay.body?.cancel()

  response = await fetch(`${PROXY}/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'x'.repeat(70 * 1024) }),
  })
  expect(response.status === 413, `oversized pairing body must be 413, got ${response.status}`)
  await response.body?.cancel()
  ok('pairing fences: wrong code, single-use replay, and oversized bodies')

  // ── R5: isolation ──────────────────────────────────────────────────────
  const candidateCredentials = path.join(stateDir, '.credentials.yaml')
  const candidateWorkspace = path.join(stateDir, 'storages', 'workspace.json')
  expect(fs.existsSync(candidateCredentials), 'candidate host did not create its own isolated credentials')
  expect(fs.statSync(candidateCredentials).mtimeMs >= runStart, 'candidate credentials were not created during this run')
  expect(fs.existsSync(candidateWorkspace), 'candidate host did not create isolated workspace state')
  expect(proxyOutput.includes('authenticated upstream browser session established'),
    `proxy never completed the upstream launch-token exchange:\n${proxyOutput}`)

  if (checkIsolation) {
    const stableAfter = snapshotTree(STABLE_HOME)
    assert.deepStrictEqual(stableAfter, stableBefore,
      `Stable rc.8 data path ${STABLE_HOME} changed during candidate verification`)
    const gitAfter = gitState(REPO)
    assert.strictEqual(gitAfter.status, gitBefore.status, 'tracked worktree files changed during candidate verification')
    assert.strictEqual(gitAfter.head, gitBefore.head, 'worktree HEAD changed during candidate verification')
    expect(fs.existsSync(path.join(candidateRootDir(), 'CANDIDATE.json')) || process.env.DSH_CANDIDATE_DIR !== undefined,
      'candidate install is not a prepared exact-version workspace')
    const compatibilityDoc = fs.readFileSync(path.join(REPO, 'docs', 'DSH-UPGRADE-COMPAT.md'), 'utf8')
    expect(compatibilityDoc.includes(CANDIDATE_VERSION), 'upgrade doc does not record the candidate version')
    expect(/rollback/i.test(compatibilityDoc), 'upgrade doc does not document rollback behavior')

    ok(`isolation: disposable state ${stateDir} (own credentials + workspace), Stable ${STABLE_HOME} untouched`)
    ok('isolation: tracked worktree and HEAD unchanged by the verification run')
    ok('isolation: rollback documented — keep the rc.8 host directory and repoint DSH_TARGET_PORT, no state migration')
    console.log(`isolation summary: candidate home ${stateDir}; stable home ${STABLE_HOME} (${stableBefore.length} entries, unchanged)`)
  } else {
    console.log('note: run with --check-isolation for the Stable-data non-mutation proof')
  }

  console.log(`\n${CANDIDATE_VERSION} candidate verification passed` +
    (checkIsolation ? ' (including isolation proof)' : ''))
} finally {
  for (const child of children) stopTree(child, 'SIGTERM')
  await shutdownChildren(children)
  if (!keepState) {
    fs.rmSync(root, { recursive: true, force: true })
  } else {
    console.log(`state kept at ${root}`)
  }
}
