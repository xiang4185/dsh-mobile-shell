import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const version = args.find((arg) => !arg.startsWith('--'))
const install = args.includes('--install')
const outputArg = args.findIndex((arg) => arg === '--output')
const output = resolve(outputArg >= 0 ? args[outputArg + 1] : `/tmp/dsh-candidate-${version ?? 'unknown'}`)

if (!version || version.startsWith('--')) {
  console.error('usage: node scripts/prepare-dsh-candidate.mjs <version> [--output /tmp/dsh-candidate] [--install]')
  process.exit(2)
}

const scopePrefix = '@deepseek-ai/dsh'
const queue = ['@deepseek-ai/dsh']
const visited = new Set()
const overrides = {}
const externalPeerRanges = new Map()

const readManifest = (name) => {
  try {
    const raw = execFileSync('npm', ['view', `${name}@${version}`, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return raw ? JSON.parse(raw) : {}
  } catch (error) {
    throw new Error(`cannot resolve exact ${name}@${version}; refusing to create a mixed-version candidate`, { cause: error })
  }
}

while (queue.length > 0) {
  const name = queue.shift()
  if (visited.has(name)) continue
  visited.add(name)
  if (name !== '@deepseek-ai/dsh') overrides[name] = version

  const manifest = readManifest(name)
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
    if (dependency.startsWith(scopePrefix) && !visited.has(dependency)) queue.push(dependency)
  }
}

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
}
