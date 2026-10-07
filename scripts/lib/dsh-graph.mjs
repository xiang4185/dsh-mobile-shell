/**
 * Exact-graph helpers for DSH candidate installs.
 *
 * A `dsh` install is only trustworthy for a candidate check when *every*
 * installed `@deepseek-ai/dsh*` package (at any npm nesting depth) is the
 * requested prerelease: the published ranges (`^0.1.0-rc.7`, `~4.0.5-alpha.1`)
 * would otherwise let npm satisfy some edges with a different prerelease and
 * silently produce a mixed stack.
 */
import fs from 'node:fs'
import path from 'node:path'

const SCOPE = '@deepseek-ai'
const MAX_DEPTH = 4

/** Every installed @deepseek-ai/dsh* package under a root, with its version. */
export function installedDshPackages(root) {
  const found = []
  const walkPackage = (dir, depth) => {
    const manifestPath = path.join(dir, 'package.json')
    if (!fs.existsSync(manifestPath)) return
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    found.push({ name: manifest.name ?? path.basename(dir), version: manifest.version })
    if (depth < MAX_DEPTH) walkNested(path.join(dir, 'node_modules'), depth + 1)
  }
  const walkScope = (modulesDir, depth) => {
    const scopeDir = path.join(modulesDir, SCOPE)
    if (!fs.existsSync(scopeDir)) return
    for (const name of fs.readdirSync(scopeDir).sort()) {
      if (name.startsWith('dsh')) walkPackage(path.join(scopeDir, name), depth)
    }
  }
  const walkNested = (modulesDir, depth) => {
    if (!fs.existsSync(modulesDir)) return
    walkScope(modulesDir, depth)
    if (depth >= MAX_DEPTH) return
    for (const entry of fs.readdirSync(modulesDir).sort()) {
      if (entry.startsWith('.') || entry.startsWith('@')) continue
      walkNested(path.join(modulesDir, entry, 'node_modules'), depth + 1)
    }
  }
  walkNested(path.join(root, 'node_modules'), 0)
  return found
}

/**
 * Verify an installed candidate graph.
 * @returns {{ packages: Array<{name: string, version: string}>, mismatch: Array<{name: string, version: string}>, exact: boolean }}
 */
export function verifyExactGraph(root, version) {
  const packages = installedDshPackages(root)
  const mismatch = packages.filter((entry) => entry.version !== version)
  return { packages, mismatch, exact: packages.length > 0 && mismatch.length === 0 }
}
