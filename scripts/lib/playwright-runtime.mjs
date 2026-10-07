/**
 * Playwright runtime bootstrap for the live browser gates.
 *
 * Resolution order:
 *   1. the repo-local `proxy/node_modules/playwright` install (CI installs it);
 *   2. a reusable cache under `$TMPDIR/dsh-mobile-shell-surfaces-runtime`.
 *
 * The cache keeps the whole browser toolchain outside the tracked worktree, so
 * a gate run never mutates the repository. Two environment fallbacks make the
 * gate work in restricted sandboxes that have no apt/dpkg database:
 *
 *   - the pinned Chromium build is downloaded with Playwright's host-requirement
 *     validation disabled (the check is advisory; the browser runs fine with the
 *     libraries provisioned below);
 *   - when the loader reports missing shared libraries, the pinned Ubuntu
 *     runtime packages are fetched and unpacked into the cache, and
 *     `LD_LIBRARY_PATH` is extended for the browser process only.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Matches `proxy/package-lock.json` so the gate uses the same E2E toolchain. */
export const PINNED_PLAYWRIGHT_VERSION = '1.59.1'

export const RUNTIME_CACHE = path.join(os.tmpdir(), 'dsh-mobile-shell-surfaces-runtime')

/**
 * Pinned Ubuntu 22.04 runtime packages for the shared libraries Playwright's
 * Chromium build needs and minimal containers tend to omit. Only consulted
 * after the loader reports the exact missing soname.
 */
const SYSTEM_LIBRARY_PINS = {
  'libatk-1.0.so.0': { pool: 'a/atk1.0', deb: 'libatk1.0-0_2.36.0-3build1' },
  'libatk-bridge-2.0.so.0': { pool: 'a/at-spi2-atk', deb: 'libatk-bridge2.0-0_2.38.0-3' },
  'libatspi.so.0': { pool: 'a/at-spi2-core', deb: 'libatspi2.0-0_2.44.0-3' },
  'libXcomposite.so.1': { pool: 'libx/libxcomposite', deb: 'libxcomposite1_0.4.5-1build2' },
  'libXdamage.so.1': { pool: 'libx/libxdamage', deb: 'libxdamage1_1.1.5-2build2' },
}

const UBUNTU_ARCH = { arm64: 'arm64', x64: 'amd64' }

function debianHost() {
  return process.arch === 'arm64'
    ? 'https://ports.ubuntu.com/ubuntu-ports'
    : 'https://archive.ubuntu.com/ubuntu'
}

export function missingSharedLibraries(message) {
  const found = new Set()
  const pattern = /error while loading shared libraries: ([^:]+): cannot open shared object file/g
  let match
  while ((match = pattern.exec(message)) !== null) found.add(match[1].trim())
  return [...found].sort()
}

function collectLibraryDirs(root) {
  const dirs = []
  const visit = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((entry) => entry.isFile() && entry.name.includes('.so'))) dirs.push(dir)
    for (const entry of entries) {
      if (entry.isDirectory()) visit(path.join(dir, entry.name))
    }
  }
  if (fs.existsSync(root)) visit(root)
  return dirs
}

/** Fetch and unpack the pinned runtime packages into the disposable cache. */
async function provisionSystemLibraries(libraries, log) {
  const arch = UBUNTU_ARCH[process.arch]
  if (!arch) throw new Error(`no pinned browser runtime libraries for ${process.arch}`)
  const extractRoot = path.join(RUNTIME_CACHE, 'system-libs', arch)
  const debRoot = path.join(RUNTIME_CACHE, 'system-libs', 'debs')

  const cachedDirs = collectLibraryDirs(extractRoot)
  const isCached = (library) => cachedDirs.some((dir) => fs.existsSync(path.join(dir, library)))
  if (libraries.every(isCached)) return cachedDirs.join(':')

  fs.mkdirSync(debRoot, { recursive: true })

  for (const library of libraries) {
    const pin = SYSTEM_LIBRARY_PINS[library]
    if (!pin) throw new Error(`browser runtime is missing ${library} and no pinned package is recorded for it`)
    const debPath = path.join(debRoot, `${pin.deb}_${arch}.deb`)
    if (!fs.existsSync(debPath)) {
      const url = `${debianHost()}/pool/main/${pin.pool}/${pin.deb}_${arch}.deb`
      log(`browser runtime: fetching ${url}`)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`failed to download ${url}: HTTP ${response.status}`)
      fs.writeFileSync(debPath, Buffer.from(await response.arrayBuffer()))
    }
  }

  fs.mkdirSync(extractRoot, { recursive: true })
  for (const library of libraries) {
    const pin = SYSTEM_LIBRARY_PINS[library]
    const debPath = path.join(debRoot, `${pin.deb}_${arch}.deb`)
    const unpack = spawnSync('dpkg-deb', ['-x', debPath, extractRoot], { encoding: 'utf8' })
    if (unpack.status !== 0) {
      throw new Error(`failed to unpack ${pin.deb}: ${unpack.stderr || unpack.stdout}`)
    }
  }
  const dirs = collectLibraryDirs(extractRoot)
  if (dirs.length === 0) throw new Error('browser runtime provisioning produced no shared libraries')
  log(`browser runtime: provisioned ${libraries.join(', ')} into ${extractRoot}`)
  return dirs.join(':')
}

async function ensurePlaywrightPackage(cacheRoot, log) {
  const entry = path.join(cacheRoot, 'node_modules', 'playwright', 'index.mjs')
  if (fs.existsSync(entry)) return entry
  log(`browser gate: installing playwright@${PINNED_PLAYWRIGHT_VERSION} into ${cacheRoot}`)
  fs.mkdirSync(cacheRoot, { recursive: true })
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', `playwright@${PINNED_PLAYWRIGHT_VERSION}`], {
    cwd: cacheRoot,
    stdio: 'inherit',
  })
  if (install.status !== 0) throw new Error(`playwright install failed with status ${install.status}`)
  if (!fs.existsSync(entry)) throw new Error(`playwright did not install at ${entry}`)
  return entry
}

function installChromium(packageRoot, env, log) {
  const cli = path.join(packageRoot, 'cli.js')
  if (!fs.existsSync(cli)) throw new Error(`playwright CLI missing at ${cli}`)
  log('browser gate: downloading the pinned Chromium headless shell')
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium', '--only-shell'], {
    stdio: 'inherit',
    env: { ...process.env, ...env, PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: '1' },
  })
  if (result.status !== 0) throw new Error(`chromium download failed with status ${result.status}`)
}

/**
 * Resolve (and if needed provision) a Playwright Chromium runtime.
 * @returns {Promise<{ chromium: import('playwright').BrowserType, env: Record<string,string>, launch: Function }>}
 */
export async function loadPlaywrightChromium({ repo, log = console.log } = {}) {
  const localEntry = path.join(repo, 'proxy', 'node_modules', 'playwright', 'index.mjs')
  let entry
  if (fs.existsSync(localEntry)) {
    entry = localEntry
    log('browser gate: using the repo-local proxy Playwright install')
  } else {
    entry = await ensurePlaywrightPackage(RUNTIME_CACHE, log)
    // Playwright resolves the browser directory from the Node process env.
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(RUNTIME_CACHE, 'browsers')
    // The advisory host-requirements check would abort before the shared-library
    // provisioning below can run; the browser launch itself is the real gate.
    process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1'
  }
  const packageRoot = path.dirname(entry)
  const { chromium } = await import(pathToFileURL(entry).href)

  let environment = {}
  const launch = async (options = {}) => {
    let lastError
    // Each round fixes at most one environment gap (missing browser build or a
    // batch of shared libraries); the loader reports the first missing soname,
    // so provisioning is iterative.
    for (let round = 0; round < 6; round += 1) {
      try {
        return await chromium.launch({
          ...options,
          env: { ...process.env, ...environment, ...(options.env ?? {}) },
        })
      } catch (error) {
        lastError = error
        const message = String(error?.message ?? '')
        if (/Executable doesn't exist|run the following command to download/i.test(message)) {
          installChromium(packageRoot, environment, log)
          continue
        }
        const missing = missingSharedLibraries(message)
        if (missing.length === 0) throw error
        const libraryPath = await provisionSystemLibraries(missing, log)
        const existing = environment.LD_LIBRARY_PATH
        environment = { ...environment, LD_LIBRARY_PATH: existing ? `${libraryPath}:${existing}` : libraryPath }
      }
    }
    throw lastError
  }

  return { chromium, get env() { return environment }, launch }
}
