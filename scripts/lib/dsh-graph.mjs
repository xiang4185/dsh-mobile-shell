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

/** Every installed @deepseek-ai/dsh* package under a root, with its version. */
export function installedDshPackages(root) {
  const found = []
  const visitedModules = new Set()

  const packageDirs = (modulesDir) => {
    if (!fs.existsSync(modulesDir)) return []
    const dirs = []
    for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue
      const entryPath = path.join(modulesDir, entry.name)
      if (entry.name.startsWith('@')) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        let scoped
        try {
          scoped = fs.readdirSync(entryPath, { withFileTypes: true })
        } catch {
          continue
        }
        for (const child of scoped.sort((a, b) => a.name.localeCompare(b.name))) {
          if (child.isDirectory() || child.isSymbolicLink()) dirs.push(path.join(entryPath, child.name))
        }
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        dirs.push(entryPath)
      }
    }
    return dirs
  }

  const walkPackage = (dir) => {
    const manifestPath = path.join(dir, 'package.json')
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (typeof manifest.name === 'string'
          && manifest.name.startsWith(`${SCOPE}/dsh`)) {
        found.push({ name: manifest.name, version: manifest.version })
      }
    }
    walkModules(path.join(dir, 'node_modules'))
  }

  const walkModules = (modulesDir) => {
    if (!fs.existsSync(modulesDir)) return
    let identity
    try {
      identity = fs.realpathSync(modulesDir)
    } catch {
      return
    }
    if (visitedModules.has(identity)) return
    visitedModules.add(identity)
    for (const packageDir of packageDirs(modulesDir)) walkPackage(packageDir)
  }

  walkModules(path.join(root, 'node_modules'))
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
