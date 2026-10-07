import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCENE_DELEGATE_PATH, extractIosEmbeddedScripts } from './lib/ios-embedded-js.mjs'

const scripts = extractIosEmbeddedScripts(readFileSync(SCENE_DELEGATE_PATH, 'utf8'))
const workdir = mkdtempSync(join(tmpdir(), 'dsh-ios-js-'))

try {
  for (const [name, script] of Object.entries(scripts)) {
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
