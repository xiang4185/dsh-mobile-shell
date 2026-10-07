/**
 * Single source of truth for the JavaScript the iOS shell injects into the DSH
 * page. The scripts are embedded as Swift multiline string literals in
 * `SceneDelegate.swift` and installed with `WKUserScript`:
 *
 *   viewportBootstrap      .atDocumentStart
 *   mobileLayoutBootstrap  .atDocumentStart
 *   mobileThemeBootstrap   .atDocumentEnd (with the welcome-art placeholder
 *                          replaced by the bundled PNG data URL)
 *
 * Both the static syntax gate (`scripts/verify-ios-embedded-js.mjs`) and the
 * live candidate gate (`scripts/verify-dsh-mobile-surfaces.mjs`) must execute
 * the shipped source itself instead of duplicating it in test code.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SCENE_DELEGATE_PATH = fileURLToPath(
  new URL('../../app/ios/App/App/SceneDelegate.swift', import.meta.url),
)

export const IOS_EMBEDDED_SCRIPTS = [
  'viewportBootstrap',
  'mobileLayoutBootstrap',
  'mobileThemeBootstrap',
]

/**
 * Extract the embedded WKUserScript sources from SceneDelegate.swift.
 * @param {string} [source] SceneDelegate.swift contents.
 * @returns {{ viewportBootstrap: string, mobileLayoutBootstrap: string, mobileThemeBootstrap: string }}
 */
export function extractIosEmbeddedScripts(source = readFileSync(SCENE_DELEGATE_PATH, 'utf8')) {
  const scripts = {}
  for (const name of IOS_EMBEDDED_SCRIPTS) {
    const marker = `private static let ${name} = """`
    const startMarker = source.indexOf(marker)
    if (startMarker < 0) throw new Error(`missing embedded script: ${name}`)

    const bodyStart = source.indexOf('\n', startMarker + marker.length)
    if (bodyStart < 0) throw new Error(`missing embedded script body: ${name}`)

    const bodyEnd = source.indexOf('\n    """', bodyStart + 1)
    if (bodyEnd < 0) throw new Error(`unterminated embedded script: ${name}`)

    scripts[name] = source.slice(bodyStart + 1, bodyEnd)
  }
  return scripts
}
