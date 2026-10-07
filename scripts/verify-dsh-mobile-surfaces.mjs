#!/usr/bin/env node
/**
 * Live mobile-surface gate: run the *actual* Stable v1.1.1 iOS injection from
 * `app/ios/App/App/SceneDelegate.swift` against a real isolated
 * `@deepseek-ai/dsh@0.2.1-alpha.1` candidate served through `dsh-remote` in a
 * browser, then prove the semantic surfaces the Stable shell depends on.
 *
 * What is executed:
 *   - the embedded `viewportBootstrap` + `mobileLayoutBootstrap` scripts are
 *     extracted from SceneDelegate.swift and injected at document start, and
 *     `mobileThemeBootstrap` at document end — the same WKUserScript order the
 *     iOS shell uses. No test-only copy of the injection exists.
 *
 * What is proven on the live candidate:
 *   - the raw `/plugins/??pkg-a/client.js,pkg-b/client.js&rev=...` multi-entry
 *     module target survives `dsh-remote` byte-for-byte: the live bundles are
 *     requested and replayed through the running proxy, a collapsed `?` target
 *     is shown to 404, and the ordinary login redirect still drops the
 *     browser-session `token` parameter;
 *   - frame / sidebar / main resolution (`data-dsh-ios-frame|sidebar|main`);
 *   - a deterministic disposable session fixture: the workspace is picked
 *     through the real picker into the disposable work dir and a new session is
 *     created through the real sidebar, leaving an active (selected) tree item;
 *   - the session-restoring gate clears once the candidate reports a stable
 *     hero/active conversation phase;
 *   - Settings open/close, the four expected categories, the General-only
 *     connection entry, and the Models tab state;
 *   - body-portaled menus stay layered above the iOS drawer (z 1100 > 1000):
 *     the drawer View options menu plus the model / permission / agent-preset
 *     Composer menus;
 *   - Composer input / add / send controls, ~44pt touch targets, and the iOS
 *     attachment entry hook on the candidate add control;
 *   - documented successor classes (bhn1Oq_*, iWlSmW_*) resolve in the DOM and
 *     the documented graceful degradations stay non-blocking.
 *
 * Isolation (R3): the candidate host runs with HOME/DSH_HOME/XDG/TMPDIR inside
 * one disposable root, the proxy uses an independent random master token and
 * the candidate's own launch token, and before/after snapshots prove ~/.dsh and
 * the tracked worktree are untouched.
 *
 * Usage:
 *   node scripts/verify-dsh-mobile-surfaces.mjs [--keep-state]
 *
 * Env: DSH_CANDIDATE_DIR (reuse an exact install), DSH_VERIFY_KEEP_BROWSER_STATE.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { shutdownChildren, stopTree } from './start-lan.mjs'
import { verifyExactGraph } from './lib/dsh-graph.mjs'
import { extractIosEmbeddedScripts } from './lib/ios-embedded-js.mjs'
import {
  CANDIDATE_PACKAGE,
  CANDIDATE_VERSION,
  STABLE_HOME,
  candidateHostEnv,
  candidateProxyEnv,
  candidateRootDir,
  createDisposableRoot,
  ensureCandidateInstall,
  freePort,
  gitState,
  randomMasterToken,
  snapshotTree,
  waitForHttp,
  waitForLaunchToken,
} from './lib/dsh-candidate.mjs'
import { loadPlaywrightChromium } from './lib/playwright-runtime.mjs'

const REPO = fileURLToPath(new URL('../', import.meta.url))

const args = process.argv.slice(2)
let keepState = false
for (const arg of args) {
  if (arg === '--keep-state') keepState = true
  else if (arg === '--help' || arg === '-h') {
    console.log('usage: node scripts/verify-dsh-mobile-surfaces.mjs [--keep-state]')
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
/** Multi-entry module targets list every plugin; keep the messages readable. */
function shortTarget(target) {
  return target.length > 120 ? `${target.slice(0, 117)}...` : target
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** Text expectations accept the candidate's English default and zh locale. */
const TEXT = {
  open: /^(Open|打开)$/,
  settingsCategories: {
    general: /^(General|通用)$/,
    models: /^(Models|模型)$/,
    plugins: /^(Built-in plugins|内置插件|插件)$/,
    agents: /^(Agent presets|智能体预设|智能体)$/,
  },
  send: /Send message|发送/,
  permissionOptions: /Read Only|Workspace Write|Full access|只读|工作区写|完全访问/,
  modelMenu: /Model|DeepSeek|模型/,
  agentMenu: /Standard mode|标准模式/,
}

// ── browser helpers ──────────────────────────────────────────────────────
async function clickSelector(page, selector, label = selector) {
  const clicked = await page.evaluate((sel) => {
    const element = document.querySelector(sel)
    if (element instanceof HTMLElement) {
      element.click()
      return true
    }
    return false
  }, selector)
  expect(clicked, `could not click ${label}`)
}

async function clickByText(page, selector, pattern, label) {
  const clicked = await page.evaluate(({ sel, source }) => {
    const re = new RegExp(source)
    const element = [...document.querySelectorAll(sel)]
      .find((candidate) => re.test((candidate.textContent ?? '').trim()) && !candidate.disabled)
    if (element instanceof HTMLElement) {
      element.click()
      return true
    }
    return false
  }, { sel: selector, source: pattern.source })
  expect(clicked, `could not click ${label}`)
}

async function waitForCondition(page, fn, label, { arg, timeout = 30_000 } = {}) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 200 })
  } catch (error) {
    throw new Error(`timed out waiting for ${label}: ${error.message}`)
  }
}

async function dismissIfVisible(page, pattern) {
  // Dialog actions are driven through their DOM click handler: candidate
  // onboarding notices animate behind their own portal mask, and the gate is
  // about the semantic surfaces, not about pointer hit-testing.
  const clicked = await page.evaluate((source) => {
    const re = new RegExp(source)
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((candidate) => re.test((candidate.textContent ?? '').trim()) && !candidate.disabled)
    if (button) {
      button.click()
      return true
    }
    return false
  }, pattern.source)
  if (clicked) await page.waitForTimeout(400)
  return clicked
}

/**
 * Raw request-target GET through the running proxy. Built on `http.request`
 * rather than `fetch` so the literal target (`??`, commas, `&rev=`) is written
 * to the request line exactly as a browser sends it — `new URL()` would be the
 * very collapsing this gate exists to detect.
 */
function proxyGet(proxyUrl, target, headers = {}) {
  const { port } = new URL(proxyUrl)
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method: 'GET', path: target, headers }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        contentType: String(response.headers['content-type'] ?? ''),
        location: response.headers.location,
        body: Buffer.concat(chunks),
      }))
    })
    request.on('error', reject)
    request.end()
  })
}

/** Candidate onboarding notices (preview notice, API-key prompt) carry a
 *  continue-style action; dismiss them until the shell is unobstructed. */
async function settleOnboarding(page) {
  const actions = [/^(Continue|继续)$/i, /^(Configure later|稍后配置)$/i, /^(Got it|知道了|好的)$/i]
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    let clicked = false
    for (const pattern of actions) {
      if (await dismissIfVisible(page, pattern)) clicked = true
    }
    const settled = await page.evaluate(() => {
      if (document.querySelector('[data-dsh-ios-main]') === null) return false
      const blocking = [...document.querySelectorAll('[role="dialog"]')]
        .filter((dialog) => !/ZuhsRW_dialog/.test(String(dialog.className)))
      return blocking.length === 0
    })
    if (settled) return
    if (!clicked) await page.waitForTimeout(500)
  }
  throw new Error('candidate onboarding dialogs never settled')
}

/** Snapshot the injected mobile surfaces and their Stable semantics. */
function surfaceProbe() {
  const html = document.documentElement
  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }
  const box = (selector) => {
    const element = document.querySelector(selector)
    if (!(element instanceof HTMLElement)) return null
    const rect = element.getBoundingClientRect()
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      aria: element.getAttribute('aria-label'),
      visible: visible(element),
      zIndex: getComputedStyle(element).zIndex,
    }
  }
  const menuLayers = [...document.querySelectorAll('body [role="menu"], body [role="listbox"], body [class*="viewOptions"], body [class*="_menu"]')]
    .map((element) => ({
      role: element.getAttribute('role'),
      // Upstream menus mount outside the app root (#root) directly on <body>.
      bodyPortaled: element.closest('#root') === null,
      zIndex: Number(getComputedStyle(element).zIndex) || 0,
      text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
    }))
    .filter((entry) => entry.zIndex >= 1000)
  const treeItems = [...document.querySelectorAll('[data-dsh-ios-sidebar] [role="treeitem"]')]
  const settingsNav = [...document.querySelectorAll('.VOzbGW_navCell')]
  return {
    htmlAttrs: {
      mobile: html.hasAttribute('data-dsh-ios-mobile'),
      compatRevision: html.getAttribute('data-dsh-ios-compat-revision'),
      sessionRestoring: html.hasAttribute('data-dsh-ios-session-restoring'),
      settingsOpen: html.hasAttribute('data-dsh-ios-settings-open'),
      settingsGeneral: html.hasAttribute('data-dsh-ios-settings-general'),
      sidebarOpen: html.hasAttribute('data-dsh-ios-sidebar-open'),
    },
    surfaces: {
      frame: !!document.querySelector('[data-dsh-ios-frame]'),
      sidebar: !!document.querySelector('[data-dsh-ios-sidebar]'),
      main: !!document.querySelector('[data-dsh-ios-main]'),
      sidebarZ: box('[data-dsh-ios-sidebar]')?.zIndex ?? null,
    },
    conversation: {
      phase: document.querySelector('.wSkVaW_root')?.getAttribute('data-phase') ?? null,
      treeItems: treeItems.map((element) => ({
        text: (element.textContent ?? '').trim().slice(0, 40),
        selected: element.getAttribute('aria-selected'),
        expanded: element.getAttribute('aria-expanded'),
      })),
    },
    settings: {
      overlay: !!document.querySelector('.VOzbGW_overlay'),
      close: !!document.querySelector('.VOzbGW_close'),
      categories: settingsNav.map((cell) => (cell.textContent ?? '').trim().slice(0, 30)),
      connectionEntry: !!document.querySelector('[data-dsh-ios-connection-entry]'),
    },
    composer: {
      input: (() => {
        const input = document.querySelector('[data-dsh-ios-main] .uV2eYG_input')
        if (!(input instanceof HTMLElement)) return null
        return {
          tag: input.tagName,
          role: input.getAttribute('role'),
          contentEditable: input.getAttribute('contenteditable'),
          composerInput: input.hasAttribute('data-composer-input'),
          isContentEditable: input.isContentEditable === true,
          phase: input.getAttribute('data-phase'),
          aria: input.getAttribute('aria-label'),
        }
      })(),
      textarea: !!document.querySelector('[data-dsh-ios-main] .uV2eYG_input textarea, [data-dsh-ios-main] textarea'),
      add: box('.uV2eYG_add'),
      addAttachmentHook: document.querySelector('.uV2eYG_add')?.getAttribute('data-dsh-ios-attachment') ?? null,
      send: box('.uV2eYG_primary'),
      model: box('._7KE1Ra_trigger'),
      permission: box('.iWlSmW_trigger'),
      agentPreset: box('.cubgiG_seat'),
    },
    successors: {
      bhn1Oq_sectionHeader: !!document.querySelector('.bhn1Oq_sectionHeader'),
      bhn1Oq_headerActions: !!document.querySelector('.bhn1Oq_headerActions'),
      iWlSmW_trigger: !!document.querySelector('.iWlSmW_trigger'),
      legacySidebarClasses: !!document.querySelector('[class*="qDHVXG_"]'),
      legacyPermissionClasses: !!document.querySelector('[class*="Sh0Q9G_"]'),
      documentedOptionalAbsent: {
        railFish: !document.querySelector('.hHd-Xa_railFish'),
        sessionLogButton: !document.querySelector('.nL4_yW_sessionLogButton'),
        mufS8W_card: !document.querySelector('.mufS8W_card'),
      },
    },
    menuLayers,
  }
}

// ── main ─────────────────────────────────────────────────────────────────
const scripts = extractIosEmbeddedScripts()
// WKUserScript(.atDocumentStart) ordering: viewport first, layout second.
const startInjection = `${scripts.viewportBootstrap}\n;\n${scripts.mobileLayoutBootstrap}`
// WKUserScript(.atDocumentEnd): the Swift side substitutes the bundled artwork
// PNG; the gate runs the same substitution with an empty asset.
const endInjection = scripts.mobileThemeBootstrap.replaceAll('__DSH_WELCOME_ART__', '')
ok('extracted the live injection from SceneDelegate.swift (viewport + layout + theme)')

const binPath = ensureCandidateInstall(candidateRootDir(), { repo: REPO, label: 'dsh-mobile-surfaces', verifyExactGraph })
const { packages, mismatch } = verifyExactGraph(candidateRootDir(), CANDIDATE_VERSION)
expect(packages.length > 0, 'candidate graph is empty')
expect(mismatch.length === 0,
  `mixed DSH prerelease stack detected: ${mismatch.slice(0, 5).map((entry) => `${entry.name}@${entry.version}`).join(', ')}`)
ok(`exact candidate graph: ${packages.length}/${packages.length} ${CANDIDATE_PACKAGE}* packages at ${CANDIDATE_VERSION}`)

const runtime = await loadPlaywrightChromium({ repo: REPO })
ok('browser runtime ready')

const dirs = createDisposableRoot('dsh-mobile-surfaces-')
const workspaceDir = path.join(dirs.workDir, 'surface-fixture')
fs.mkdirSync(workspaceDir, { recursive: true })
fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# disposable mobile-surface fixture\n')

const hostPort = await freePort()
const proxyPort = await freePort()
const masterToken = randomMasterToken()
const stableBefore = snapshotTree(STABLE_HOME)
const gitBefore = gitState(REPO)
const runStart = Date.now()

const children = []
let browser
const pageErrors = []
try {
  // ── isolated candidate host + proxy ─────────────────────────────────────
  const host = spawn(process.execPath, [binPath, 'web', '--no-open', '--port', String(hostPort)], {
    cwd: dirs.workDir,
    env: candidateHostEnv(dirs),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  children.push(host)
  const { token: launchToken } = await waitForLaunchToken(host)
  await waitForHttp(`http://127.0.0.1:${hostPort}/`, 30_000)
  ok(`published ${CANDIDATE_VERSION} host started on 127.0.0.1:${hostPort} (disposable DSH_HOME)`)

  const proxy = spawn(process.execPath, [path.join(REPO, 'proxy', 'dsh-remote.mjs')], {
    cwd: REPO,
    env: candidateProxyEnv({ ...dirs, masterToken, upstreamToken: launchToken, hostPort, proxyPort }),
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

  // ── real browser, real paired session, real injection ──────────────────
  browser = await runtime.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
    locale: 'en-US',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  // R1: record every raw `/plugins/??...` module-bundle target the live
  // candidate requests and how the proxy answered it. `new URL()` on the proxy
  // side collapses the second `?`, so a non-200 here is the module-URL
  // regression, not a candidate failure.
  const moduleBundles = []
  page.on('response', (response) => {
    const url = response.url()
    if (!url.startsWith(`${PROXY}/`) || !url.includes('??')) return
    moduleBundles.push({ target: url.slice(PROXY.length), status: response.status() })
  })
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`)
  })
  // The two document-start WKUserScripts, executed before any page script.
  await page.addInitScript({ content: startInjection })
  // Real master-token login: the proxy sets the HttpOnly device cookie and
  // redirects to the token-free UI, exactly like a paired phone.
  await page.goto(`${PROXY}/?token=${encodeURIComponent(masterToken)}`, { waitUntil: 'domcontentloaded' })
  // WKUserScript(.atDocumentEnd) equivalent for the first document.
  await page.evaluate(endInjection)

  await waitForCondition(page, () => document.title.includes('DeepSeek Harness'), 'the DeepSeek Harness document')
  await waitForCondition(page, () => document.documentElement.hasAttribute('data-dsh-ios-mobile'), 'the mobile shell attribute')
  try {
    await settleOnboarding(page)
  } catch (error) {
    // A collapsed multi-entry target 404s in the candidate, so a proxy that
    // rebuilt the URL would stall here with an opaque onboarding timeout.
    const failedBundle = moduleBundles.find((bundle) => bundle.status !== 200)
    if (failedBundle === undefined) throw error
    throw new Error(`dsh-remote did not preserve the raw /plugins/?? module target (${shortTarget(failedBundle.target)} -> HTTP ${failedBundle.status}); the candidate UI cannot boot without it`)
  }
  await waitForCondition(page, () => document.querySelector('[data-dsh-ios-main]') !== null, 'frame/sidebar/main resolution')
  ok('real candidate UI loaded through dsh-remote with the Stable injection active')

  let surfaces = await page.evaluate(surfaceProbe)
  expect(surfaces.htmlAttrs.compatRevision === '1', 'mobile compatibility revision marker missing')
  expect(surfaces.surfaces.frame && surfaces.surfaces.sidebar && surfaces.surfaces.main,
    `frame/sidebar/main not all resolved: ${JSON.stringify(surfaces.surfaces)}`)
  expect(['hero', 'active'].includes(surfaces.conversation.phase),
    `unexpected conversation phase: ${surfaces.conversation.phase}`)
  ok('frame / sidebar / main surfaces resolve on the injected candidate')

  // ── R1: the raw /plugins/??... module target survives dsh-remote ───────
  expect(moduleBundles.length > 0,
    'the live candidate requested no /plugins/?? multi-entry module bundle through dsh-remote')
  for (const bundle of moduleBundles) {
    expect(bundle.status === 200,
      `multi-entry module bundle ${shortTarget(bundle.target)} returned HTTP ${bundle.status} through dsh-remote; the raw request target was not preserved`)
  }
  const deviceCookie = (await context.cookies(PROXY)).find((entry) => entry.name === 'dsh_token')
  expect(deviceCookie !== undefined, 'the paired dsh_token session cookie is missing from the browser context')
  const session = { cookie: `dsh_token=${deviceCookie.value}` }
  const bundleTarget = moduleBundles[0].target
  ok(`live candidate requested ${moduleBundles.length} /plugins/?? module bundle(s), e.g. ${shortTarget(bundleTarget)}`)

  const rawBundle = await proxyGet(PROXY, bundleTarget, session)
  expect(rawBundle.status === 200,
    `replaying the raw module target ${shortTarget(bundleTarget)} through dsh-remote returned HTTP ${rawBundle.status}`)
  expect(/javascript/.test(rawBundle.contentType),
    `raw module bundle content-type is ${rawBundle.contentType}, expected JavaScript`)
  expect(rawBundle.body.length > 0, 'raw module bundle is empty')
  // Control: the same target with the second `?` collapsed is what a
  // `new URL()`-rebuilt forward would send; it must 404, otherwise this
  // regression check would not be load-bearing.
  const collapsedTarget = bundleTarget.replace('??', '?')
  const collapsedBundle = await proxyGet(PROXY, collapsedTarget, session)
  expect(collapsedBundle.status === 404,
    `the collapsed control ${shortTarget(collapsedTarget)} returned HTTP ${collapsedBundle.status}, expected 404`)
  ok('raw /plugins/?? target passes through dsh-remote unmodified (collapsed ? control 404s)')

  // The ordinary browser-session token path must keep being removed: the
  // master-token login still redirects to the token-free request target.
  const tokenLogin = await proxyGet(PROXY, `/?token=${encodeURIComponent(masterToken)}`)
  expect(tokenLogin.status === 302, `master-token login returned HTTP ${tokenLogin.status}, expected the token redirect`)
  expect(tokenLogin.location === '/',
    `the login redirect kept the browser-session token parameter: ${tokenLogin.location}`)
  ok('ordinary requests still drop the browser-session token parameter')

  // ── deterministic disposable fixture: workspace + new session ──────────
  const stateBeforeFixture = snapshotTree(dirs.stateDir)

  await clickSelector(page, '.pXSMma_workspace', 'the workspace picker trigger')
  await page.waitForSelector('[role="dialog"] .ZuhsRW_crumbEditZone', { timeout: 20_000 })
  await clickSelector(page, '[role="dialog"] .ZuhsRW_crumbEditZone', 'the workspace path editor')
  await page.waitForSelector('[role="dialog"] input.ZuhsRW_pathInput', { timeout: 10_000 })
  await page.locator('[role="dialog"] input.ZuhsRW_pathInput').first().fill(workspaceDir, { force: true })
  await page.keyboard.press('Enter')
  await waitForCondition(page, () => {
    const open = [...document.querySelectorAll('[role="dialog"] button')].find((button) => /^(Open|打开)$/.test(button.textContent.trim()))
    return open !== undefined && !open.disabled
  }, 'the workspace Open action')
  await clickByText(page, '[role="dialog"] button', TEXT.open, 'the workspace Open action')
  await waitForCondition(page,
    (name) => document.querySelector('.pXSMma_workspace')?.textContent.includes(name),
    'the disposable workspace selection',
    { arg: path.basename(workspaceDir) })

  await clickSelector(page, '[data-dsh-ios-menu]', 'the iOS sidebar toggle')
  await waitForCondition(page, () => document.documentElement.hasAttribute('data-dsh-ios-sidebar-open'), 'the iOS drawer')
  await clickSelector(page, '.hHd-Xa_newSession', 'the sidebar new-session action')
  await waitForCondition(page,
    () => document.querySelector('[data-dsh-ios-sidebar] [role="treeitem"][aria-selected="true"]') !== null,
    'an active (selected) conversation tree item')
  await waitForCondition(page, () => !document.documentElement.hasAttribute('data-dsh-ios-session-restoring'),
    'the session-restoring gate to clear')
  surfaces = await page.evaluate(surfaceProbe)
  expect(surfaces.conversation.treeItems.length >= 1, 'no sidebar session tree items after the fixture')
  expect(surfaces.conversation.treeItems.some((item) => item.selected === 'true'),
    'the fixture session is not the active conversation')
  expect(surfaces.conversation.treeItems.some((item) => item.expanded === 'true'),
    'the disposable workspace tree item is not expanded')
  ok(`disposable session fixture active (${surfaces.conversation.treeItems.length} tree items, selected="${surfaces.conversation.treeItems.find((item) => item.selected === 'true')?.text}")`)
  ok('session-restoring gate cleared for a hero/active conversation phase')

  // ── Composer: input / add / send / model / permission / agent preset ───
  const composer = surfaces.composer
  expect(composer.input !== null, 'Composer input (.uV2eYG_input) not found inside [data-dsh-ios-main]')
  expect(composer.input.role === 'textbox', `Composer input is not a textbox: ${JSON.stringify(composer.input)}`)
  expect(composer.input.isContentEditable && composer.input.contentEditable === 'true',
    `Composer input is not editable: ${JSON.stringify(composer.input)}`)
  expect(composer.input.composerInput,
    'candidate Composer textbox lost the [data-composer-input] semantic hook')
  expect(composer.input.phase !== 'inert', 'Composer stayed inert after the workspace was selected')
  expect(composer.add?.visible, 'Composer add control not visible')
  expect(composer.send?.visible, 'Composer send control not visible')
  expect(composer.model?.visible, 'Composer model control not visible')
  expect(composer.permission?.visible, 'Composer permission control not visible')
  expect(composer.agentPreset?.visible, 'Composer agent-preset control not visible')
  for (const [name, control] of Object.entries({ add: composer.add, send: composer.send, model: composer.model, permission: composer.permission, agentPreset: composer.agentPreset })) {
    expect(control.height >= 43, `Composer ${name} touch target is ${control.height}px, expected the Stable ~44pt target`)
  }
  ok(`Composer textbox (${composer.input.tag.toLowerCase()} + ${composer.input.composerInput ? 'data-composer-input' : 'contenteditable'}), add, and send controls resolve with ~44pt targets`)

  expect(composer.addAttachmentHook === '1',
    'the iOS attachment entry did not hook the candidate Composer add control')
  expect(/添加附件/.test(composer.add.aria ?? ''), 'the iOS attachment aria-label is missing')
  ok('iOS attachment entry hooked the candidate Composer add control (data-dsh-ios-attachment)')

  // The shipped mobile input-intent hook must recognize the candidate's
  // contenteditable composer, not only a legacy <textarea>.
  expect(composer.textarea === false, 'candidate unexpectedly renders a <textarea> Composer; update this gate')
  expect(scripts.mobileLayoutBootstrap.includes('isContentEditable'),
    'the mobile input-intent hook does not recognize the candidate contenteditable Composer')
  await page.evaluate(() => {
    const input = document.querySelector('[data-dsh-ios-main] .uV2eYG_input')
    input?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }))
    input?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  })
  ok('mobile input-intent hook recognizes the candidate contenteditable Composer')

  // ── body-portaled menus above the iOS drawer ────────────────────────────
  const menuLayerQuery = 'body [role="menu"], body [role="listbox"], body [class*="viewOptions"], body [class*="_menu"]'
  const openPortalMenu = async (selector, label, pattern) => {
    await page.keyboard.press('Escape')
    await page.evaluate(() => document.querySelector('[data-dsh-ios-main]')?.click())
    await page.waitForTimeout(500)
    await clickSelector(page, selector, label)
    await waitForCondition(page, ({ query, source }) => {
      const re = source === null ? null : new RegExp(source)
      return [...document.querySelectorAll(query)].some((element) => {
        if ((Number(getComputedStyle(element).zIndex) || 0) < 1100) return false
        return re === null || re.test((element.textContent ?? '').trim())
      })
    }, `${label} portal menu`, { arg: { query: menuLayerQuery, source: pattern ? pattern.source : null } })
    const menu = (await page.evaluate(surfaceProbe)).menuLayers
      .filter((entry) => entry.zIndex >= 1100 && (pattern === undefined || pattern.test(entry.text)))
      .pop()
    expect(menu !== undefined, `${label} did not render a layered portal`)
    expect(menu.zIndex >= 1100, `${label} portal z-index ${menu.zIndex} is below the documented 1100 menu layer`)
    expect(menu.bodyPortaled, `${label} menu is not body-portaled: ${JSON.stringify(menu)}`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    return menu
  }

  const modelMenu = await openPortalMenu('._7KE1Ra_trigger', 'model', TEXT.modelMenu)
  const permissionMenu = await openPortalMenu('.iWlSmW_trigger', 'permission', TEXT.permissionOptions)
  const agentMenu = await openPortalMenu('.cubgiG_seat', 'agent preset', TEXT.agentMenu)
  ok(`model / permission / agent-preset menus open as body portals at z=${modelMenu.zIndex}/${permissionMenu.zIndex}/${agentMenu.zIndex}`)

  await clickSelector(page, '[data-dsh-ios-menu]', 'the iOS sidebar toggle')
  await waitForCondition(page, () => document.documentElement.hasAttribute('data-dsh-ios-sidebar-open'), 'the iOS drawer')
  surfaces = await page.evaluate(surfaceProbe)
  const sidebarZ = Number(surfaces.surfaces.sidebarZ)
  expect(sidebarZ === 1000, `iOS drawer must stay at the documented z=1000, got ${surfaces.surfaces.sidebarZ}`)
  const viewOptions = await openPortalMenu('[aria-label="视图选项"], [aria-label="View options"]', 'drawer view options')
  expect(viewOptions.zIndex >= 1100 && viewOptions.zIndex > sidebarZ,
    `drawer menu layer ${viewOptions.zIndex} is not above the drawer (${sidebarZ})`)
  ok(`drawer View options menu is body-portaled at z=${viewOptions.zIndex} above the z=${sidebarZ} drawer`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ── Settings open/close, categories, General-only entry ────────────────
  await page.evaluate(() => document.querySelector('[aria-label="关闭侧边栏"], [data-dsh-ios-backdrop]')?.click())
  await clickSelector(page, '.VOzbGW_trigger', 'the Settings trigger')
  await waitForCondition(page, () => document.documentElement.hasAttribute('data-dsh-ios-settings-open'), 'Settings to open')
  surfaces = await page.evaluate(surfaceProbe)
  expect(surfaces.settings.overlay, 'Settings overlay did not mount')
  expect(surfaces.settings.categories.length === 4,
    `expected the four Settings categories, got ${JSON.stringify(surfaces.settings.categories)}`)
  for (const [name, pattern] of Object.entries(TEXT.settingsCategories)) {
    expect(surfaces.settings.categories.some((label) => pattern.test(label)),
      `Settings category "${name}" missing from ${JSON.stringify(surfaces.settings.categories)}`)
  }
  expect(surfaces.htmlAttrs.settingsGeneral, 'General did not report as the active Settings category')
  expect(surfaces.settings.connectionEntry, 'the Stable current-host connection entry was not injected')
  ok(`Settings opened with categories ${JSON.stringify(surfaces.settings.categories)} and the current-host entry`)

  await clickByText(page, '.VOzbGW_navCell', TEXT.settingsCategories.models, 'the Models category')
  await waitForCondition(page, () => !document.documentElement.hasAttribute('data-dsh-ios-settings-general'),
    'the General category marker to clear on Models')
  ok('Settings category switching updates the General/Models state')
  await clickSelector(page, '.dsh-ios-native-settings-back', 'the iOS Settings back button')
  await waitForCondition(page, () => !document.documentElement.hasAttribute('data-dsh-ios-settings-open'), 'Settings to close')
  surfaces = await page.evaluate(surfaceProbe)
  expect(!surfaces.settings.overlay, 'Settings overlay still mounted after close')
  ok('Settings closed through the injected iOS back control')

  // ── documented successor classes and graceful degradations ─────────────
  expect(surfaces.successors.bhn1Oq_sectionHeader && surfaces.successors.bhn1Oq_headerActions,
    'documented sidebar successor classes (bhn1Oq_*) do not resolve in the live DOM')
  expect(surfaces.successors.iWlSmW_trigger, 'documented permission successor (iWlSmW_trigger) does not resolve')
  expect(!surfaces.successors.legacySidebarClasses && !surfaces.successors.legacyPermissionClasses,
    'legacy qDHVXG_*/Sh0Q9G_* classes leaked into the candidate DOM')
  ok('documented successor classes resolve and legacy generations stay absent')
  const absent = Object.entries(surfaces.successors.documentedOptionalAbsent)
    .filter(([, isAbsent]) => isAbsent)
    .map(([name]) => name)
  if (absent.length > 0) {
    console.log(`note: documented graceful degradations confirmed absent: ${absent.join(', ')}`)
  }

  // ── isolation: disposable state only, Stable rc.8 and worktree untouched ─
  const stateAfterFixture = snapshotTree(dirs.stateDir)
  expect(JSON.stringify(stateAfterFixture) !== JSON.stringify(stateBeforeFixture),
    'the browser fixture did not persist into the disposable DSH_HOME')
  const candidateCredentials = path.join(dirs.stateDir, '.credentials.yaml')
  const candidateWorkspace = path.join(dirs.stateDir, 'storages', 'workspace.json')
  expect(fs.existsSync(candidateCredentials), 'candidate host did not create its own isolated credentials')
  expect(fs.statSync(candidateCredentials).mtimeMs >= runStart, 'candidate credentials were not created during this run')
  expect(fs.existsSync(candidateWorkspace), 'candidate host did not create isolated workspace state')
  expect(proxyOutput.includes('authenticated upstream browser session established'),
    `proxy never completed the upstream launch-token exchange:\n${proxyOutput.slice(0, 800)}`)

  const browserState = await page.evaluate(() => ({
    documentCookie: document.cookie,
    bodyText: document.body.textContent ?? '',
  }))
  expect(!browserState.documentCookie.includes('dshd1.'),
    'the device token leaked into document.cookie')
  expect(!browserState.bodyText.includes(masterToken),
    'the proxy master token leaked into the rendered page')

  const stableAfter = snapshotTree(STABLE_HOME)
  assert.deepStrictEqual(stableAfter, stableBefore,
    `Stable rc.8 data path ${STABLE_HOME} changed during the mobile-surface gate`)
  const gitAfter = gitState(REPO)
  assert.strictEqual(gitAfter.status, gitBefore.status, 'tracked worktree files changed during the mobile-surface gate')
  assert.strictEqual(gitAfter.head, gitBefore.head, 'worktree HEAD changed during the mobile-surface gate')
  ok(`isolation: browser fixture persisted only inside ${dirs.stateDir}`)
  ok(`isolation: Stable ${STABLE_HOME} and the tracked worktree are unchanged`)

  const unexpectedErrors = pageErrors.filter((error) => !/Failed to load resource.*40[13]/.test(error))
  expect(unexpectedErrors.length === 0,
    `candidate page reported errors during the injected run:\n${unexpectedErrors.slice(0, 5).join('\n')}`)
  ok('no uncaught page or console errors under the injected candidate')

  console.log(`\nmobile-surface gate passed for ${CANDIDATE_VERSION} with the Stable v1.1.1 injection`)
} finally {
  if (browser !== undefined) await browser.close().catch(() => {})
  for (const child of children) stopTree(child, 'SIGTERM')
  await shutdownChildren(children)
  if (!keepState) {
    fs.rmSync(dirs.root, { recursive: true, force: true })
  } else {
    console.log(`state kept at ${dirs.root}`)
  }
}
