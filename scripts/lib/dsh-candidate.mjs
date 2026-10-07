/**
 * Shared helpers for driving an exact-version DSH candidate install.
 *
 * Every consumer starts the published candidate host with `HOME`, `DSH_HOME`,
 * `XDG_*`, and `TMPDIR` inside one disposable root so the Stable rc.8 state
 * (`~/.dsh`) is never read, migrated, or written. Keeping the bootstrap in one
 * module means the isolation contract cannot drift between gates.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const CANDIDATE_VERSION = '0.2.1-alpha.1'
export const CANDIDATE_PACKAGE = '@deepseek-ai/dsh'
export const STABLE_HOME = path.join(os.homedir(), '.dsh')

/** Disposable exact-version install cache shared by the candidate gates. */
export function candidateRootDir() {
  return process.env.DSH_CANDIDATE_DIR
    ?? path.join(os.tmpdir(), 'dsh-mobile-shell-candidate', CANDIDATE_VERSION)
}

/**
 * Ensure an exact `@deepseek-ai/dsh@0.2.1-alpha.1` graph exists under `root`
 * and return the candidate CLI entrypoint.
 */
export function ensureCandidateInstall(root, { repo, label = 'dsh-candidate', verifyExactGraph }) {
  const bin = path.join(root, 'node_modules', CANDIDATE_PACKAGE, 'lib', 'bin.js')
  if (fs.existsSync(bin)) {
    const { packages, exact } = verifyExactGraph(root, CANDIDATE_VERSION)
    if (exact) {
      console.log(`ok   reusing exact candidate install ${root} (${packages.length} ${CANDIDATE_PACKAGE}* packages at ${CANDIDATE_VERSION})`)
      return bin
    }
    console.log(`${label}: candidate install at ${root} is not an exact ${CANDIDATE_VERSION} graph; rebuilding`)
    fs.rmSync(root, { recursive: true, force: true })
  }

  console.log(`${label}: preparing exact ${CANDIDATE_VERSION} candidate graph in ${root}`)
  fs.mkdirSync(root, { recursive: true })
  const preparedManifest = path.join(root, 'CANDIDATE.json')
  if (!fs.existsSync(preparedManifest)) {
    const prepare = spawnSync(process.execPath, [
      path.join(repo, 'scripts', 'prepare-dsh-candidate.mjs'),
      CANDIDATE_VERSION,
      '--output', root,
    ], { stdio: 'inherit', cwd: repo })
    if (prepare.status !== 0) throw new Error(`prepare-dsh-candidate.mjs failed with status ${prepare.status}`)
  }

  const install = spawnSync('npm', ['install', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=4096' },
  })
  if (install.status !== 0) throw new Error(`candidate install failed with status ${install.status}`)
  return bin
}

/**
 * Metadata-only snapshot: names, types, sizes, and mtimes. Files are never
 * opened, so the Stable credential file is not read while proving isolation.
 */
export function snapshotTree(root) {
  const entries = []
  const visit = (dir, relative) => {
    let children
    try {
      children = fs.readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const childPath = path.join(dir, child.name)
      const childRelative = relative === '' ? child.name : `${relative}/${child.name}`
      const stat = fs.lstatSync(childPath)
      entries.push(`${childRelative}|${child.isDirectory() ? 'dir' : 'file'}|${stat.size}|${stat.mtimeMs}`)
      if (child.isDirectory()) visit(childPath, childRelative)
    }
  }
  if (!fs.existsSync(root)) return ['<absent>']
  visit(root, '')
  return entries
}

export function gitState(repo) {
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo, encoding: 'utf8' })
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' })
  return { status: status.stdout ?? '', head: (head.stdout ?? '').trim() }
}

/**
 * Environment for the candidate host: disposable HOME/DSH_HOME/TMPDIR/XDG plus
 * removal of every inherited DSH credential or deployment override.
 */
export function candidateHostEnv({ homeDir, stateDir, tmpDir }) {
  const env = { ...process.env,
    HOME: homeDir,
    DSH_HOME: stateDir,
    TMPDIR: tmpDir,
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    XDG_CACHE_HOME: path.join(homeDir, '.cache'),
    XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
    XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
    NO_COLOR: '1',
  }
  for (const leaked of ['DSH_REMOTE_TOKEN', 'DSH_UPSTREAM_TOKEN', 'DSH_PUBLIC_URL', 'DSH_TLS_CERT', 'DSH_TLS_KEY', 'DSH_LAUNCHER', 'DSH_LISTEN_HOST', 'DSH_LISTEN_PORT']) {
    delete env[leaked]
  }
  return env
}

/** Independent proxy environment: random master token, no inherited secrets. */
export function candidateProxyEnv({ homeDir, stateDir, masterToken, upstreamToken, hostPort, proxyPort }) {
  const env = { ...process.env,
    HOME: homeDir,
    DSH_HOME: stateDir,
    DSH_REMOTE_TOKEN: masterToken,
    DSH_UPSTREAM_TOKEN: upstreamToken,
    DSH_LISTEN_HOST: '127.0.0.1',
    DSH_LISTEN_PORT: String(proxyPort),
    DSH_TARGET_HOST: '127.0.0.1',
    DSH_TARGET_PORT: String(hostPort),
    DSH_PAIR_QR: 'off',
    NO_COLOR: '1',
  }
  for (const leaked of ['DSH_PUBLIC_URL', 'DSH_TLS_CERT', 'DSH_TLS_KEY', 'DSH_LAUNCHER']) delete env[leaked]
  return env
}

export function createDisposableRoot(prefix = 'dsh-candidate-run-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const dirs = {
    root,
    homeDir: path.join(root, 'home'),
    stateDir: path.join(root, 'dsh-home'),
    workDir: path.join(root, 'work'),
    tmpDir: path.join(root, 'tmp'),
  }
  for (const dir of [dirs.homeDir, dirs.stateDir, dirs.workDir, dirs.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dirs
}

/** Fresh 256-bit proxy credential that never leaves this run. */
export function randomMasterToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

export async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      await response.body?.cancel()
      return response
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`${url} did not become reachable: ${lastError?.message ?? 'timeout'}`)
}

export function cookieHeader(response) {
  const cookies = response.headers.getSetCookie?.() ?? []
  const session = cookies.map((entry) => entry.split(';', 1)[0]).find((entry) => entry.startsWith('dsh_token='))
  return session === undefined ? undefined : { cookie: session }
}

/**
 * Wait until the candidate host prints its per-process launch token and return
 * it together with the collected stdout/stderr.
 */
export function waitForLaunchToken(child, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    let output = ''
    const started = Date.now()
    const timer = setInterval(() => {
      const match = /[?&]token=([A-Za-z0-9._~-]+)/.exec(output)
      if (match) {
        clearInterval(timer)
        resolve({ token: match[1], output })
        return
      }
      if (child.exitCode !== null) {
        clearInterval(timer)
        reject(new Error(`candidate host exited early:\n${output}`))
        return
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`candidate host never printed a launch token:\n${output}`))
      }
    }, 100)
    child.stdout?.on('data', (chunk) => { output += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk) => { output += chunk.toString('utf8') })
    child.on('close', () => {
      const match = /[?&]token=([A-Za-z0-9._~-]+)/.exec(output)
      if (match) {
        clearInterval(timer)
        resolve({ token: match[1], output })
      }
    })
  })
}
