import type { CapacitorConfig } from '@capacitor/cli'

/**
 * dsh-mobile shell: the bundled www/ holds only the launcher page. After the
 * user pairs with a host, the launcher navigates the WebView to the remote
 * `dsh web` origin (via the token proxy), so the app always runs the exact
 * frontend the host serves — frontend and backend versions never diverge.
 */
const config: CapacitorConfig = {
  appId: 'com.dshmobile.app',
  appName: 'DSH',
  webDir: 'www',
  // Fallback color for any native area briefly exposed while WKWebView is
  // being resized by the iOS keyboard.
  backgroundColor: '#ffffff',
  server: {
    // LAN hosts are plain HTTP until phase 2 adds TLS at the proxy (ADR-0004).
    // http scheme keeps the launcher origin non-secure so healthz fetches to
    // http:// hosts are not blocked as mixed content.
    androidScheme: 'http',
    cleartext: true,
    // The whole point of the shell: the WebView must load the user-specified
    // dsh host origin instead of handing it to the system browser. Users
    // connect to arbitrary self-hosted addresses, so the allowlist is a
    // wildcard — the token gate at dsh-remote is the trust boundary.
    allowNavigation: ['*'],
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    Keyboard: {
      // iOS only: DSHKeyboardViewportViewController is the single viewport
      // driver and follows keyboardLayoutGuide interactively. Disable the
      // plugin resize path so no second frame update competes with UIKit.
      resize: 'none',
      // Capacitor 8.0.4+ can tint the small native backdrop area that may be
      // exposed between a resized WKWebView and the keyboard. Match the
      // current DOM background so light/dark themes do not show a black seam.
      autoBackdropColor: 'dom',
    },
  },
}

export default config
