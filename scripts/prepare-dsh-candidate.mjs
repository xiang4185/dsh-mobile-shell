import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifyExactGraph } from './lib/dsh-graph.mjs'

const args = process.argv.slice(2)
/** Published release this repository's candidate checks are pinned to. */
export const DSH_CANDIDATE_VERSION = '0.2.1-alpha.1'
const positional = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--output')
const version = positional[0] ?? DSH_CANDIDATE_VERSION
const install = args.includes('--install')
const outputArg = args.findIndex((arg) => arg === '--output')
const output = resolve(outputArg >= 0 ? args[outputArg + 1] : `/tmp/dsh-candidate-${version}`)

if (version.startsWith('--')) {
  console.error('usage: node scripts/prepare-dsh-candidate.mjs [version] [--output /tmp/dsh-candidate] [--install]')
  process.exit(2)
}

function verifyInstalledGraph(directory) {
  const { packages, mismatch, exact } = verifyExactGraph(directory, version)
  console.log(`installed @deepseek-ai/dsh* packages: ${packages.length}`)
  if (!exact) {
    if (packages.length === 0) throw new Error(`no @deepseek-ai/dsh* packages installed under ${directory}`)
    const sample = mismatch.slice(0, 10).map((entry) => `${entry.name}@${entry.version}`).join(', ')
    throw new Error(`mixed DSH prerelease stack: expected every package at ${version}; found ${mismatch.length} mismatch(es): ${sample}`)
  }
  console.log(`ok   all ${packages.length} installed @deepseek-ai/dsh* packages are exactly ${version}`)
}

const scopePrefix = '@deepseek-ai/dsh'
const queue = ['@deepseek-ai/dsh']
const visited = new Set()
const overrides = {}
const externalPeerRanges = new Map()

/** Registry reads are independent; a small pool keeps the walk seconds, not minutes. */
const MANIFEST_CONCURRENCY = 6
const readManifest = (name) => new Promise((resolveManifest, rejectManifest) => {
  execFile('npm', ['view', `${name}@${version}`, '--json'], { encoding: 'utf8' }, (error, stdout) => {
    if (error) {
      rejectManifest(new Error(`cannot resolve exact ${name}@${version}; refusing to create a mixed-version candidate`, { cause: error }))
      return
    }
    const raw = String(stdout ?? '').trim()
    try {
      resolveManifest(raw ? JSON.parse(raw) : {})
    } catch (parseError) {
      rejectManifest(new Error(`cannot parse the ${name}@${version} manifest`, { cause: parseError }))
    }
  })
})

const absorbManifest = (name, manifest) => {
  visited.add(name)
  if (name !== '@deepseek-ai/dsh') overrides[name] = version

  const peerDependencies = manifest.peerDependencies ?? {}
  const peerMeta = manifest.peerDependenciesMeta ?? {}
  for (const [peer, spec] of Object.entries(peerDependencies)) {
    if (peer.startsWith(scopePrefix) || peerMeta[peer]?.optional) continue
    if (!externalPeerRanges.has(peer)) externalPeerRanges.set(peer, new Set())
    externalPeerRanges.get(peer).add(spec)
  }
  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
    ...peerDependencies,
  }
  for (const dependency of Object.keys(dependencies)) {
    if (dependency.startsWith(scopePrefix) && !visited.has(dependency) && !queue.includes(dependency)) queue.push(dependency)
  }
}

let inFlight = 0
await Promise.all(Array.from({ length: MANIFEST_CONCURRENCY }, async () => {
  while (true) {
    const name = queue.shift()
    if (name === undefined) {
      if (inFlight === 0) return
      await new Promise((resolveWait) => setTimeout(resolveWait, 20))
      continue
    }
    if (visited.has(name)) continue
    inFlight += 1
    try {
      absorbManifest(name, await readManifest(name))
    } finally {
      inFlight -= 1
    }
  }
}))

const externalPeers = {}
for (const [name, specs] of [...externalPeerRanges].sort(([a], [b]) => a.localeCompare(b))) {
  if (specs.size !== 1) {
    throw new Error(`conflicting non-DSH peer ranges for ${name}: ${[...specs].join(', ')}`)
  }
  externalPeers[name] = [...specs][0]
}

mkdirSync(output, { recursive: true })
const packageJson = {
  name: `dsh-candidate-${version.replaceAll('.', '-').replaceAll('+', '-')}`,
  private: true,
  version: '0.0.0',
  // Make every discovered DSH package an exact direct dependency as well as
  // an override. This removes npm's freedom to satisfy prerelease peer ranges
  // with a newer rc while also avoiding an expensive peer-resolution search.
  dependencies: {
    ...Object.fromEntries([...visited].sort().map((name) => [name, version])),
    ...externalPeers,
  },
  overrides,
}
writeFileSync(resolve(output, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
writeFileSync(resolve(output, 'CANDIDATE.json'), `${JSON.stringify({
  dshVersion: version,
  exactPackages: visited.size,
  requiredExternalPeers: Object.keys(externalPeers).length,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`)

console.log(`prepared exact DSH candidate manifest: ${output}`)
console.log(`version: ${version}`)
console.log(`exactly pinned @deepseek-ai/dsh* packages: ${visited.size}`)
console.log(`required non-DSH peers: ${Object.keys(externalPeers).length}`)

if (install) {
  console.log('installing candidate...')
  execFileSync('npm', ['install', '--ignore-scripts', '--legacy-peer-deps'], {
    cwd: output,
    stdio: 'inherit',
    env: {
      ...process.env,
      // The exact prerelease override graph is large enough that npm can hit
      // Node's default ~2 GiB old-space limit (rc.8 does on this host).
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=4096',
    },
  })
  console.log('candidate install complete')
  verifyInstalledGraph(output)
}
