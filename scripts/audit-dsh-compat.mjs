import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const contractPath = resolve('compat/dsh-ui-contract.json')
const sceneDelegatePath = resolve('app/ios/App/App/SceneDelegate.swift')
const contract = JSON.parse(readFileSync(contractPath, 'utf8'))

const args = process.argv.slice(2)
let baseline = contract.baselineVersion
const candidates = []
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (arg === '--baseline') baseline = args[++index]
  else if (arg === '--candidate') candidates.push(...args[++index].split(',').filter(Boolean))
  else if (arg === '--help' || arg === '-h') {
    console.log('usage: node scripts/audit-dsh-compat.mjs [--baseline 0.1.0-rc.6] --candidate 0.1.0-rc.7[,0.1.0-rc.8]')
    process.exit(0)
  } else {
    throw new Error(`unknown argument: ${arg}`)
  }
}

if (candidates.length === 0) candidates.push('0.1.0-rc.7', '0.1.0-rc.8')

const cacheRoot = join(tmpdir(), 'dsh-mobile-shell-compat-cache')
mkdirSync(cacheRoot, { recursive: true })

const safe = (value) => value.replaceAll('/', '__').replaceAll('@', '')
const packageDir = (name, version) => join(cacheRoot, `${safe(name)}__${version}`)

const unpackPackage = (name, version) => {
  const target = packageDir(name, version)
  const extracted = join(target, 'package')
  if (existsSync(extracted)) return extracted

  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  const tarball = execFileSync('npm', ['pack', `${name}@${version}`, '--silent'], {
    cwd: target,
    encoding: 'utf8',
  }).trim()
  if (!tarball) throw new Error(`npm pack returned no tarball for ${name}@${version}`)
  execFileSync('tar', ['-xzf', basename(tarball)], { cwd: target, stdio: 'ignore' })
  return extracted
}

const collectText = (directory) => {
  let text = ''
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) text += collectText(path)
    else if (/\.(?:css|js|json)$/.test(entry.name)) text += `${readFileSync(path, 'utf8')}\n`
  }
  return text
}

const corpusFor = (version) => {
  let corpus = ''
  for (const packageName of contract.packages) {
    corpus += collectText(unpackPackage(packageName, version))
  }
  return corpus
}

const sceneDelegate = readFileSync(sceneDelegatePath, 'utf8')
const prefixPattern = contract.privateClassPrefixes
  .map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')
const selectorPattern = new RegExp(`\\.((?:${prefixPattern})[A-Za-z0-9_-]+)`, 'g')
const referenced = [...new Set([...sceneDelegate.matchAll(selectorPattern)].map((match) => match[1]))].sort()
const optional = new Set(contract.optionalBreaks)

console.log(`DSH UI compatibility audit`)
console.log(`baseline:   ${baseline}`)
console.log(`candidates: ${candidates.join(', ')}`)
console.log(`selectors referenced by iOS shell: ${referenced.length}`)

const baselineCorpus = corpusFor(baseline)
const baselineKnown = referenced.filter((className) => baselineCorpus.includes(className))
const baselineUnmapped = referenced.filter((className) => !baselineCorpus.includes(className))
console.log(`baseline-mapped private classes: ${baselineKnown.length}`)
if (baselineUnmapped.length > 0) {
  console.log(`baseline-unmapped/fallback classes (${baselineUnmapped.length}): ${baselineUnmapped.join(', ')}`)
}

let failed = false
for (const candidate of candidates) {
  const corpus = corpusFor(candidate)
  const missing = baselineKnown.filter((className) => !corpus.includes(className))
  const tolerated = missing.filter((className) => optional.has(className))
  const breaking = missing.filter((className) => !optional.has(className))

  console.log(`\n${candidate}: ${baselineKnown.length - missing.length}/${baselineKnown.length} baseline classes retained`)
  if (tolerated.length > 0) console.log(`  tolerated removals: ${tolerated.join(', ')}`)
  if (breaking.length > 0) {
    failed = true
    console.error(`  BREAKING removals: ${breaking.join(', ')}`)
  } else {
    console.log('  no contract-breaking private-class removals')
  }
}

if (failed) process.exitCode = 1
