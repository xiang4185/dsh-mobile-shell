import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const sceneDelegatePath = resolve('app/ios/App/App/SceneDelegate.swift')
const source = readFileSync(sceneDelegatePath, 'utf8')
const names = ['viewportBootstrap', 'mobileLayoutBootstrap', 'mobileThemeBootstrap']
const workdir = mkdtempSync(join(tmpdir(), 'dsh-ios-js-'))

try {
  for (const name of names) {
    const marker = `private static let ${name} = \"\"\"`
    const startMarker = source.indexOf(marker)
    if (startMarker < 0) throw new Error(`missing embedded script: ${name}`)

    const bodyStart = source.indexOf('\n', startMarker + marker.length)
    if (bodyStart < 0) throw new Error(`missing embedded script body: ${name}`)

    const bodyEnd = source.indexOf('\n    \"\"\"', bodyStart + 1)
    if (bodyEnd < 0) throw new Error(`unterminated embedded script: ${name}`)

    const script = source.slice(bodyStart + 1, bodyEnd)
    const path = join(workdir, `${name}.js`)
    writeFileSync(path, script)

    const result = spawnSync(process.execPath, ['--check', path], {
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout || '')
      throw new Error(`${name} failed node --check`)
    }
    console.log(`ok   ${name}`)
  }
} finally {
  rmSync(workdir, { recursive: true, force: true })
}

console.log('all embedded iOS JavaScript checks passed')
