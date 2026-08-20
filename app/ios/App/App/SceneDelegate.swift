import UIKit
import Capacitor
import WebKit
import QuartzCore

private extension Notification.Name {
    static let dshNativeSignal = Notification.Name("dsh.nativeSignal")
}

private enum DSHTheme {
    static let oceanDeep = UIColor(red: 18.0 / 255.0, green: 37.0 / 255.0, blue: 93.0 / 255.0, alpha: 1)
    static let ocean = UIColor(red: 40.0 / 255.0, green: 121.0 / 255.0, blue: 232.0 / 255.0, alpha: 1)
    static let cyan = UIColor(red: 88.0 / 255.0, green: 217.0 / 255.0, blue: 245.0 / 255.0, alpha: 1)
    static let pale = UIColor(red: 236.0 / 255.0, green: 249.0 / 255.0, blue: 255.0 / 255.0, alpha: 1)
    static let border = UIColor(red: 76.0 / 255.0, green: 168.0 / 255.0, blue: 242.0 / 255.0, alpha: 0.28)
}

private final class DSHWeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

final class DSHBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var nativeSignalHandler: DSHWeakScriptMessageHandler?

    private static let viewportBootstrap = """
    (() => {
      const apply = () => {
        const root = document.documentElement
        const head = document.head
        if (!root || !head) return

        let viewport = document.querySelector('meta[name="viewport"]')
        if (!viewport) {
          viewport = document.createElement('meta')
          viewport.setAttribute('name', 'viewport')
          head.appendChild(viewport)
        }

        const parts = (viewport.getAttribute('content') ?? '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
        const has = (name) => parts.some((part) => part.toLowerCase().startsWith(name + '='))
        if (!has('width')) parts.push('width=device-width')
        if (!has('initial-scale')) parts.push('initial-scale=1')
        if (!has('viewport-fit')) parts.push('viewport-fit=cover')
        viewport.setAttribute('content', parts.join(', '))
      }

      if (document.readyState === 'loading') {
        if (document.querySelector('meta[name="viewport"]')) {
          apply()
        }
        document.addEventListener('DOMContentLoaded', apply, { once: true })
      } else {
        apply()
      }
    })()
    """

    private static let mobileLayoutBootstrap = """
    (() => {
      let root = document.documentElement
      const media = window.matchMedia('(max-width: 900px)')
      const isMobileDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      const mobileActive = () => isMobileDevice || media.matches
      let startupTextFocusUnlocked = false
      const unlockStartupTextFocus = () => {
        startupTextFocusUnlocked = true
      }
      if (isMobileDevice) {
        document.addEventListener('pointerdown', unlockStartupTextFocus, { capture: true, passive: true })
        document.addEventListener('touchstart', unlockStartupTextFocus, { capture: true, passive: true })
        document.addEventListener('mousedown', unlockStartupTextFocus, { capture: true, passive: true })
      }
      const nativeHTMLElementFocus = HTMLElement.prototype.focus
      HTMLElement.prototype.focus = function (...args) {
        const isTextEntry = this.matches?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')
        if (isMobileDevice && !startupTextFocusUnlocked && isTextEntry) return
        return nativeHTMLElementFocus.apply(this, args)
      }
      // Upstream DSH uses CSS Modules, so operational queries must live in one
      // compatibility registry instead of spreading private class names across
      // event/state code. Prefer adding semantic selectors here before adding
      // another one-off query elsewhere. CSS migration remains incremental.
      const dshCompatSelectors = Object.freeze({
        conversationRoot: ['.wSkVaW_root'],
        conversationScrollBody: ['.wSkVaW_scrollBody'],
        conversationTab: ['.wSkVaW_tab'],
        frame: ['.pI_x6G_frame'],
        sidebarRoot: ['.hHd-Xa_root'],
        sidebarColumn: ['.pI_x6G_sidebarCol'],
        mainColumn: ['.pI_x6G_centerCol'],
        sidebarToggle: ['.hHd-Xa_toggle'],
        composerAdd: ['.uV2eYG_add'],
        composerInput: ['.uV2eYG_input'],
        settingsTrigger: ['.VOzbGW_trigger'],
        settingsOverlay: ['.VOzbGW_overlay'],
        settingsContent: ['.VOzbGW_content'],
        settingsNavCell: ['.VOzbGW_navCell'],
        settingsClose: ['.VOzbGW_close', '[aria-label="关闭"]', '[aria-label="Close"]'],
        sessionLogButton: ['.nL4_yW_sessionLogButton'],
        workspaceButton: ['.pXSMma_workspace'],
      })
      const dshCompat = Object.freeze({
        selector(key) {
          const selectors = dshCompatSelectors[key]
          if (!selectors) throw new Error(`unknown DSH compatibility selector: ${key}`)
          return selectors.join(', ')
        },
        first(key, scope = document) {
          return scope?.querySelector?.(this.selector(key)) ?? null
        },
        all(key, scope = document) {
          return [...(scope?.querySelectorAll?.(this.selector(key)) ?? [])]
        },
        closest(element, key) {
          return element?.closest?.(this.selector(key)) ?? null
        },
        directChild(key, scope) {
          const selectors = dshCompatSelectors[key]
          if (!selectors) throw new Error(`unknown DSH compatibility selector: ${key}`)
          for (const selector of selectors) {
            const match = scope?.querySelector?.(`:scope > ${selector}`)
            if (match) return match
          }
          return null
        },
      })
      let webReadySignaled = false
      const signalNative = (event, detail = {}) => {
        try {
          window.webkit?.messageHandlers?.dshNativeSignal?.postMessage({ event, ...detail })
        } catch (_) { /* native bridge is optional outside the iOS shell */ }
      }
      const signalWebReady = () => {
        if (webReadySignaled) return
        webReadySignaled = true
        signalNative('dshWebReady')
      }
      let sessionReadyCandidate = ''
      let sessionReadyFrames = 0
      let sessionReadyCheckQueued = false
      const queueSessionReadyCheck = () => {
        if (sessionReadyCheckQueued || webReadySignaled) return
        sessionReadyCheckQueued = true
        window.requestAnimationFrame(() => {
          sessionReadyCheckQueued = false
          syncFrame()
        })
      }
      const sessionReadyKey = () => {
        const conversation = dshCompat.first('conversationRoot')
        const phase = conversation?.getAttribute('data-phase')
        if (phase !== 'active' && phase !== 'hero') return null
        const treeItems = [...(sidebar?.querySelectorAll('[role="treeitem"]') ?? [])]
        const selected = treeItems.find((element) => element.getAttribute('aria-selected') === 'true')
        if (phase === 'hero' && selected === void 0 && treeItems.some((element) => !element.hasAttribute('aria-expanded'))) return null
        return `${phase}|${selected instanceof HTMLElement ? cleanText(selected.textContent) : ''}`
      }
      const syncSessionReveal = () => {
        if (webReadySignaled) return true
        const key = sessionReadyKey()
        if (key === null) {
          root.setAttribute('data-dsh-ios-session-restoring', '')
          sessionReadyCandidate = ''
          sessionReadyFrames = 0
          return false
        }
        if (key !== sessionReadyCandidate) {
          sessionReadyCandidate = key
          sessionReadyFrames = 0
          root.setAttribute('data-dsh-ios-session-restoring', '')
          queueSessionReadyCheck()
          return false
        }
        sessionReadyFrames += 1
        if (sessionReadyFrames < 2) {
          queueSessionReadyCheck()
          return false
        }
        root.removeAttribute('data-dsh-ios-session-restoring')
        signalWebReady()
        return true
      }
      const css = `
        html[data-dsh-ios-mobile] {
          --dsh-ios-safe-top: env(safe-area-inset-top, 0px);
          --dsh-ios-safe-bottom: env(safe-area-inset-bottom, 0px);
          --dsh-ios-accent: #007aff;
          --dsh-ios-accent-soft: rgba(0, 122, 255, 0.14);
          --dsh-ios-accent-soft-strong: rgba(0, 122, 255, 0.22);
          --dsh-ios-glass: rgba(255, 255, 255, 0.62);
          --dsh-ios-glass-strong: rgba(255, 255, 255, 0.78);
          --dsh-ios-glass-border: rgba(255, 255, 255, 0.5);
          --dsh-ios-glass-edge: rgba(255, 255, 255, 0.7);
          --dsh-ios-shadow: 0 20px 50px rgba(20, 28, 64, 0.18);
          --dsh-ios-scrim: rgba(18, 20, 32, 0.28);
          --dsh-ios-page-bg: #ffffff;
          background: var(--dsh-ios-page-bg);
          -webkit-text-size-adjust: 100%;
        }

        @media (prefers-color-scheme: dark) {
          html[data-dsh-ios-mobile] {
            --dsh-ios-glass: rgba(28, 30, 38, 0.55);
            --dsh-ios-glass-strong: rgba(28, 30, 38, 0.72);
            --dsh-ios-glass-border: rgba(255, 255, 255, 0.14);
            --dsh-ios-glass-edge: rgba(255, 255, 255, 0.22);
            --dsh-ios-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            --dsh-ios-scrim: rgba(0, 0, 0, 0.42);
            --dsh-ios-page-bg: #121212;
          }
        }

        html[data-dsh-ios-mobile],
        html[data-dsh-ios-mobile] body,
        html[data-dsh-ios-mobile] #root {
          box-sizing: border-box;
          width: 100%;
          max-width: 100vw;
          min-width: 0;
          overflow-x: hidden !important;
        }

        html[data-dsh-ios-mobile] body {
          height: 100dvh;
          min-height: 100dvh;
          margin: 0;
          padding-top: 0;
          overflow-y: hidden;
          overscroll-behavior: none;
          background: var(--dsh-ios-page-bg);
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-frame] {
          box-sizing: border-box;
          width: 100% !important;
          max-width: 100vw !important;
          min-width: 0 !important;
          height: 100% !important;
          grid-template-columns: minmax(0, 1fr) !important;
        }

        html[data-dsh-ios-mobile] #root {
          height: 100dvh !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .wSkVaW_root {
          height: 100% !important;
          min-height: 0 !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] {
          box-sizing: border-box;
          grid-column: 1 !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          height: 100% !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-session-restoring] [data-dsh-ios-main] {
          visibility: hidden !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .wSkVaW_scrollBody {
          box-sizing: border-box;
          min-height: 0 !important;
          padding-top: max(8px, var(--dsh-ios-safe-top)) !important;
          scroll-padding-top: calc(52px + var(--dsh-ios-safe-top));
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }


        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] {
          box-sizing: border-box;
          position: fixed !important;
          top: 0 !important;
          right: auto !important;
          bottom: 0 !important;
          left: calc(-1 * min(86vw, 352px)) !important;
          width: min(86vw, 352px) !important;
          max-width: 352px !important;
          min-width: 0 !important;
          height: 100dvh !important;
          overflow: hidden !important;
          /* Keep the drawer below DSH's body portals (menus are z=1100).
             The backdrop/native chrome sits at 900, so the drawer remains
             above the conversation without trapping popup menus underneath. */
          z-index: 1000 !important;
          transition: left 260ms cubic-bezier(.32, .72, .28, 1) !important;
          border: 0 !important;
          background: transparent !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root {
          min-height: 0 !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
          height: 100% !important;
          border-right: 1px solid var(--dsh-ios-glass-border) !important;
          border-radius: 0 28px 28px 0 !important;
          background: var(--dsh-ios-glass) !important;
          box-shadow: var(--dsh-ios-shadow), inset 1px 0 0 var(--dsh-ios-glass-edge) !important;
          -webkit-backdrop-filter: saturate(180%) blur(44px) !important;
          backdrop-filter: saturate(180%) blur(44px) !important;
          overflow-x: hidden !important;
          overflow: hidden !important;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          padding-top: var(--dsh-ios-safe-top) !important;
          padding-bottom: max(16px, var(--dsh-ios-safe-bottom)) !important;
          will-change: left;
        }
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_regionArea {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_listArea,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_treeBody,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_list {
          min-height: 0 !important;
        }

        /* Mobile hierarchy for the workspace browser: search stays a primary
           utility on the title row; display/add controls become a labelled
           secondary management row instead of three same-weight tiny icons. */
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_sectionHeader {
          box-sizing: border-box !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 44px !important;
          grid-template-areas:
            "label search"
            "actions actions" !important;
          align-items: center !important;
          gap: 6px 8px !important;
          height: auto !important;
          min-height: 98px !important;
          margin: 2px 0 4px !important;
          padding: 2px 4px 8px !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_sectionLabel {
          grid-area: label !important;
          min-width: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          color: var(--dsw-alias-label-secondary, #667085) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_searchSlot {
          grid-area: search !important;
          justify-self: end !important;
          width: 44px !important;
          max-width: 44px !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_searchButton {
          box-sizing: border-box !important;
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          padding: 0 !important;
          border: 1px solid var(--dsh-ios-glass-border) !important;
          border-radius: 14px !important;
          background: rgba(255, 255, 255, 0.46) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_headerActions {
          grid-area: actions !important;
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 8px !important;
          width: 100% !important;
          max-width: none !important;
          opacity: 1 !important;
          visibility: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_headerActions > * {
          min-width: 0 !important;
          width: 100% !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_headerActions .qDHVXG_iconButton {
          box-sizing: border-box !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 7px !important;
          width: 100% !important;
          min-width: 0 !important;
          height: 44px !important;
          min-height: 44px !important;
          padding: 0 10px !important;
          border: 1px solid var(--dsh-ios-glass-border) !important;
          border-radius: 14px !important;
          color: var(--dsw-alias-label-secondary, #667085) !important;
          background: rgba(255, 255, 255, 0.34) !important;
          font-size: 13px !important;
          white-space: nowrap !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_headerActions .qDHVXG_iconButton[aria-label="视图选项"]::after {
          content: "视图与排序";
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_headerActions .qDHVXG_iconButton[aria-label="View options"]::after {
          content: "View & sort";
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_headerActions .qDHVXG_iconButton[aria-label="添加工作区"]::after {
          content: "添加工作区";
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_headerActions .qDHVXG_iconButton[aria-label="Add workspace"]::after {
          content: "Add workspace";
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_sectionHeader:has(.qDHVXG_searchSlotExpanded) {
          grid-template-columns: minmax(0, 1fr) !important;
          grid-template-areas: "search" !important;
          min-height: 52px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_sectionHeader:has(.qDHVXG_searchSlotExpanded) .qDHVXG_sectionLabel,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_sectionHeader:has(.qDHVXG_searchSlotExpanded) .qDHVXG_headerActions {
          display: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_searchSlotExpanded {
          width: 100% !important;
          max-width: none !important;
          justify-self: stretch !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_searchSlotExpanded .qDHVXG_search {
          width: 100% !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_searchSlotExpanded .qDHVXG_searchInput {
          box-sizing: border-box !important;
          height: 40px !important;
          min-height: 40px !important;
          border-radius: 12px !important;
          font-size: 16px !important;
        }
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .YDXeBa_projectRow,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .YDXeBa_sessionRow,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .YDXeBa_searchResultRow,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_sectionHeader,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_searchButton {
          min-height: 44px !important;
          touch-action: manipulation !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .YDXeBa_projectRow {
          min-height: 48px !important;
          border-radius: 14px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .YDXeBa_sessionRow,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .YDXeBa_searchResultRow {
          min-height: 46px !important;
          border-radius: 14px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .YDXeBa_iconButton {
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          min-height: 44px !important;
          touch-action: manipulation !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-sidebar-open] [data-dsh-ios-sidebar] {
          left: 0 !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed {
          padding: 6px 12px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_logoRow {
          justify-content: flex-end !important;
          height: 60px !important;
          margin-bottom: 8px !important;
          padding: 8px 0 8px 4px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_iconButton {
          width: 28px !important;
          height: 28px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_toggle .hHd-Xa_panelIcon {
          display: inline !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_toggle .hHd-Xa_railFish {
          display: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_newSession {
          align-self: auto !important;
          gap: 6px !important;
          width: auto !important;
          height: 40px !important;
          margin: 0 2px 8px !important;
          padding: 8px 16px !important;
          border-radius: 14px !important;
          border-color: var(--dsh-ios-glass-border) !important;
          background: var(--dsh-ios-glass-strong) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_newSessionLabel {
          max-width: 200px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_regionArea {
          margin-left: -4px !important;
          margin-right: calc(-1 * var(--dsh-sidebar-inline-padding)) !important;
          padding-left: 4px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_footArea {
          align-items: stretch !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_settingsArea,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root.hHd-Xa_collapsed .hHd-Xa_footerActions {
          justify-content: flex-start !important;
          width: 100% !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea {
          box-sizing: border-box !important;
          margin-top: auto !important;
          padding: 10px 10px 2px !important;
          border-top: 0 !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_footerActions:empty {
          display: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_listArea,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_treeBody,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_list {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .qDHVXG_fade {
          display: none !important;
          background: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea .VOzbGW_trigger,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea > button,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea > a,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea > [role="button"] {
          box-sizing: border-box !important;
          display: flex !important;
          align-items: center !important;
          width: 100% !important;
          min-height: 54px !important;
          padding: 12px 16px !important;
          border: 1px solid rgba(76, 168, 242, 0.14) !important;
          border-radius: 17px !important;
          justify-content: center !important;
          gap: 9px !important;
          color: var(--dsw-alias-label-primary, #1f2329) !important;
          background: rgba(255, 255, 255, 0.34) !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.64) !important;
          text-align: center !important;
          touch-action: manipulation !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea .VOzbGW_trigger:active,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea > button:active,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea > a:active,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root .hHd-Xa_settingsArea > [role="button"]:active {
          border-color: var(--dsh-ios-glass-border) !important;
          background: var(--dsh-ios-accent-soft) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_regionArea,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_regionArea > *,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_newSession,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .uV2eYG_add {
          touch-action: manipulation !important;
          -webkit-tap-highlight-color: transparent !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] button,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] [role="button"],
        html[data-dsh-ios-mobile] [data-dsh-ios-main] button,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] [role="button"] {
          min-height: 44px;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] input,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] textarea,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] select {
          font-size: max(16px, 1em) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .wSkVaW_header {
          display: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_card {
          border-radius: 26px !important;
          border: 1px solid var(--dsh-ios-glass-border) !important;
          background: var(--dsh-ios-glass-strong) !important;
          box-shadow: var(--dsh-ios-shadow), inset 0 1px 0 var(--dsh-ios-glass-edge) !important;
          -webkit-backdrop-filter: saturate(180%) blur(34px) !important;
          backdrop-filter: saturate(180%) blur(34px) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_input {
          /* The visual rounding belongs to the composer card. Rounding the
             absolutely-positioned textarea clips its hit-test corners in
             WebKit, which made taps near the input edge intermittently miss. */
          border-radius: 0 !important;
          z-index: 2 !important;
          touch-action: manipulation !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_grow {
          min-height: 44px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_row {
          display: grid !important;
          grid-template-columns: auto minmax(0, 1fr) !important;
          gap: 6px !important;
          padding: 0 7px 6px !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_tools {
          flex: none !important;
          min-width: 0 !important;
          gap: 6px !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_modes {
          flex: 0 0 auto !important;
          min-width: 0 !important;
          max-width: 52px !important;
          gap: 6px !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_trailing {
          flex: none !important;
          width: 100% !important;
          gap: 6px !important;
          min-width: 0 !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_add,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .Sh0Q9G_trigger,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_trigger {
          min-width: 44px !important;
          min-height: 44px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .Sh0Q9G_trigger {
          padding-inline: 8px 4px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .Sh0Q9G_trigger,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_trigger {
          position: relative !important;
          isolation: isolate;
          border-radius: 0 !important;
          border-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat {
          max-width: min(40vw, 128px) !important;
          padding-inline: 7px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_root {
          flex: 1 1 auto !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          margin-left: 6px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_trigger {
          width: 100% !important;
          max-width: none !important;
          padding-inline: 8px 4px !important;
          justify-content: center !important;
          font-size: 14px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_menu,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .mufS8W_card {
          width: min(320px, calc(100vw - 24px)) !important;
          max-width: min(320px, calc(100vw - 24px)) !important;
          max-height: min(46dvh, 360px) !important;
          border-radius: 18px !important;
          background: var(--dsh-ios-glass-strong) !important;
          border-color: var(--dsh-ios-glass-border) !important;
          box-shadow: var(--dsh-ios-shadow) !important;
          -webkit-backdrop-filter: saturate(180%) blur(34px) !important;
          backdrop-filter: saturate(180%) blur(34px) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .mufS8W_card {
          left: 0 !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_add,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_primary {
          box-sizing: border-box !important;
          flex: 0 0 44px !important;
          width: 44px !important;
          min-width: 44px !important;
          max-width: 44px !important;
          height: 44px !important;
          min-height: 44px !important;
          max-height: 44px !important;
          padding: 0 !important;
          /* Keep the actual hit target rectangular; the circular appearance is
             painted by ::before in the whale theme below. */
          position: relative !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .JObwrW_trigger {
          border-radius: 999px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_primary {
          transform: none !important;
          background: transparent !important;
          color: #fff !important;
          box-shadow: none !important;
        }

        html[data-dsh-ios-mobile] [data-composer-seat] {
          padding-bottom: 8px !important;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-chrome {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: calc(60px + var(--dsh-ios-safe-top));
          z-index: 900;
          pointer-events: none;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-native-chrome {
          display: none !important;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-topbar {
          box-sizing: border-box;
          position: relative;
          width: 100%;
          height: 100%;
          padding: 0;
          background: transparent;
          border: 0;
          z-index: 1;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-sidebar-open] .dsh-ios-native-menu-btn {
          opacity: 0;
          pointer-events: none;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu,
        html[data-dsh-ios-mobile] .dsh-ios-native-menu-btn {
          position: absolute;
          top: calc(var(--dsh-ios-safe-top) + 8px);
          box-sizing: border-box;
          width: 44px;
          height: 44px;
          padding: 11px;
          border: 1px solid var(--dsh-ios-glass-border);
          border-radius: 999px;
          color: var(--dsw-alias-label-primary, #1f2329);
          background: var(--dsh-ios-glass);
          box-shadow: 0 6px 20px rgba(20, 28, 64, 0.16), inset 0 1px 0 var(--dsh-ios-glass-edge);
          -webkit-backdrop-filter: saturate(180%) blur(30px);
          backdrop-filter: saturate(180%) blur(30px);
          pointer-events: auto;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu {
          left: 10px;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu-btn {
          right: 10px;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu:active,
        html[data-dsh-ios-mobile] .dsh-ios-native-menu-btn:active {
          background: var(--dsh-ios-glass-strong);
          transform: scale(0.94);
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu-panel {
          position: fixed;
          top: calc(var(--dsh-ios-safe-top) + 58px);
          right: 12px;
          box-sizing: border-box;
          width: min(280px, calc(100vw - 24px));
          max-height: min(68vh, 460px);
          display: none;
          padding: 6px;
          border: 1px solid var(--dsh-ios-glass-border);
          border-radius: 24px;
          color: var(--dsw-alias-label-primary, #1f2329);
          background: var(--dsh-ios-glass-strong);
          box-shadow: var(--dsh-ios-shadow), inset 0 1px 0 var(--dsh-ios-glass-edge);
          -webkit-backdrop-filter: saturate(180%) blur(44px);
          backdrop-filter: saturate(180%) blur(44px);
          pointer-events: auto;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          transform-origin: top right;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-menu-open] .dsh-ios-native-menu-panel {
          display: block;
          animation: dshIosMenuIn 180ms cubic-bezier(.22, 1, .36, 1);
        }

        @keyframes dshIosMenuIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu-title {
          padding: 8px 14px 6px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: var(--dsw-alias-label-tertiary, #7f8792);
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
          width: 100%;
          min-height: 44px;
          margin: 0;
          padding: 10px 12px;
          border: 0;
          border-radius: 14px;
          color: var(--dsw-alias-label-primary, #1f2329);
          background: transparent;
          text-align: left;
          font-size: 15px;
          line-height: 20px;
          pointer-events: auto;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu-item:active {
          background: var(--dsh-ios-accent-soft);
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu-item[data-dsh-ios-menu-active="true"] {
          color: var(--dsh-ios-accent);
          background: var(--dsh-ios-accent-soft);
          font-weight: 600;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu-sep {
          height: 1px;
          margin: 6px 10px;
          background: var(--dsh-ios-glass-border);
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-settings-back {
          position: fixed;
          top: var(--dsh-ios-safe-top);
          left: 8px;
          display: none;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          width: 44px;
          height: 44px;
          padding: 10px;
          border: 1px solid var(--dsh-ios-glass-border);
          border-radius: 999px;
          color: var(--dsw-alias-label-primary, #1f2329);
          background: var(--dsh-ios-glass);
          box-shadow: 0 6px 20px rgba(20, 28, 64, 0.16);
          -webkit-backdrop-filter: saturate(180%) blur(30px);
          backdrop-filter: saturate(180%) blur(30px);
          z-index: 22000;
          pointer-events: auto;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-native-settings-back {
          display: flex;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-backdrop {
          position: fixed;
          inset: 0;
          display: none;
          background: var(--dsh-ios-scrim);
          z-index: 0;
          pointer-events: auto;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-sidebar-open] .dsh-ios-native-backdrop {
          display: block;
          animation: dshIosFadeIn 200ms ease;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-sidebar-open] [data-dsh-ios-main] {
          pointer-events: none !important;
          user-select: none !important;
        }

        @keyframes dshIosFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] body {
          overflow: hidden !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] [data-dsh-ios-sidebar] {
          left: 0 !important;
          width: 100vw !important;
          max-width: none !important;
          overflow: visible !important;
          z-index: 1000 !important;
          pointer-events: auto !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] [data-dsh-ios-sidebar] .hHd-Xa_root {
          width: 100vw !important;
          max-width: none !important;
          overflow: visible !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          pointer-events: auto !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_overlay {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          max-width: none !important;
          height: 100dvh !important;
          max-height: none !important;
          overflow: visible !important;
          z-index: 1000 !important;
          background: transparent !important;
          pointer-events: auto !important;
          touch-action: auto;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_panel {
          box-sizing: border-box !important;
          width: 100vw !important;
          max-width: 100vw !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          border-radius: 0 !important;
          overflow: visible !important;
          flex-direction: column !important;
          padding-bottom: var(--dsh-ios-safe-bottom) !important;
          background: var(--dsw-alias-bg-layer-2) !important;
          border: 0 !important;
          box-shadow: none !important;
          pointer-events: auto !important;
          touch-action: auto;
        }


        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_mask {
          display: none !important;
          pointer-events: none !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_nav {
          box-sizing: border-box !important;
          width: 100% !important;
          flex: 0 0 auto !important;
          padding: calc(7px + var(--dsh-ios-safe-top)) 14px 0 58px !important;
          gap: 0 !important;
          border-bottom: 1px solid var(--dsh-ios-glass-border) !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navTitle {
          display: none !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navList {
          width: 100% !important;
          flex-direction: row !important;
          gap: 2px !important;
          overflow-x: auto !important;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navList::-webkit-scrollbar {
          display: none;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell {
          position: relative !important;
          min-height: 40px !important;
          height: 40px !important;
          flex: 0 0 auto !important;
          padding: 7px 10px 8px !important;
          justify-content: center !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell[aria-current="true"],
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell.VOzbGW_active {
          color: var(--dsh-ios-ocean-deep) !important;
          background: transparent !important;
          box-shadow: inset 0 -2px 0 var(--dsh-ios-ocean) !important;
          font-weight: 600 !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navLabel {
          display: inline !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_content {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          width: 100% !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_header {
          display: none !important;
          height: 0 !important;
          min-height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_close {
          display: none !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_options {
          min-width: 0 !important;
          padding: 4px 16px calc(28px + var(--dsh-ios-safe-bottom)) !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-connection {
          box-sizing: border-box;
          display: none;
          align-items: center;
          gap: 8px;
          margin: 18px 16px 10px;
          padding: 13px 2px 11px;
          min-height: 56px;
          border: 0;
          border-top: 1px solid var(--dsh-ios-glass-border);
          border-radius: 0;
          color: var(--dsw-alias-label-primary, #1f2329);
          background: transparent;
          box-shadow: none;
          touch-action: manipulation;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open][data-dsh-ios-settings-general] .dsh-ios-settings-connection {
          display: flex;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-connection:active {
          background: var(--dsh-ios-accent-soft);
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-connection-icon {
          display: none;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-connection-copy {
          min-width: 0;
          flex: 1 1 auto;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-connection-title {
          font-size: 15px;
          line-height: 20px;
          font-weight: 500;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-connection-host {
          margin-top: 2px;
          overflow: hidden;
          color: var(--dsw-alias-label-secondary, #707780);
          font-size: 12px;
          line-height: 16px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-connection-chevron {
          flex: 0 0 auto;
          color: var(--dsw-alias-label-tertiary, #8b929b);
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-pairing-confirm {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 4px 16px 12px;
          padding: 14px;
          border: 1px solid var(--dsh-ios-glass-border);
          border-radius: 18px;
          background: var(--dsh-ios-glass-strong);
          box-shadow: inset 0 1px 0 var(--dsh-ios-glass-edge);
        }
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-pairing-confirm-message {
          color: var(--dsw-alias-label-primary, #1f2329);
          font-size: 14px;
          line-height: 20px;
        }
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-pairing-confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-pairing-confirm-actions button {
          min-width: 72px;
          min-height: 44px;
          padding: 10px 12px;
          border: 0;
          border-radius: 12px;
          font: inherit;
          color: var(--dsw-alias-label-primary, #1f2329);
          background: var(--dsh-ios-accent-soft);
          touch-action: manipulation;
        }
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .dsh-ios-settings-pairing-confirm-actions .dsh-ios-settings-pairing-confirm-primary {
          color: #fff;
          background: var(--dsh-ios-accent);
        }
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_options input,
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_options textarea,
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_options select {
          font-size: max(16px, 1em) !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .jLrgrW_dialog {
          width: calc(100vw - 28px) !important;
          max-width: calc(100vw - 28px) !important;
          border-radius: 24px !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .jLrgrW_content {
          padding: 16px !important;
        }

        @media (prefers-reduced-motion: reduce) {
          html[data-dsh-ios-mobile] [data-dsh-ios-sidebar],
          html[data-dsh-ios-mobile] .dsh-ios-native-menu-panel {
            transition: none !important;
            animation: none !important;
          }
        }
      `

      let started = false
      let frame = null
      let sidebar = null
      let main = null
      let chrome = null
      let settingsBack = null
      let sidebarButton = null
      let menuButton = null
      let menuPanel = null
      let systemAttachmentInput = null
      let drawerGesture = null
      let settingsPairingConfirm = null
      let settingsConnectionEntry = null
      let readerResizeObserver = null
      let readerResizeBody = null
      let readerResizeCleanup = null
      let readerAnchor = null
      let readerViewportHeight = null
      let readerPinnedToBottom = false

      const cleanText = (value) => (value ?? '').replace(/\\s+/g, ' ').trim()
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return !element.hidden && element.getAttribute('aria-hidden') !== 'true'
          && style.display !== 'none' && style.visibility !== 'hidden'
          && rect.width > 0 && rect.height > 0
      }
      const clickFirst = (sel) => {
        const el = document.querySelector(sel)
        if (el instanceof HTMLElement) el.click()
        return el instanceof HTMLElement
      }
      const findTab = (label) =>
        dshCompat.all('conversationTab').find(t => cleanText(t.textContent) === label) || null
      const switchTab = (label) => {
        const tab = findTab(label)
        if (tab instanceof HTMLElement) tab.click()
      }
      const conversationViewActive = () => {
        const conv = findTab('对话')
        return !conv || conv.classList.contains('wSkVaW_tabActive')
      }


      const ensureSystemAttachmentInput = () => {
        if (systemAttachmentInput?.isConnected) return systemAttachmentInput
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        // DSH rc.7/rc.8 currently admit image attachments only. Keep the
        // native picker aligned with the upstream intake contract instead of
        // letting users select arbitrary files that the composer will reject.
        input.accept = 'image/png,image/jpeg,image/webp,image/gif'
        input.tabIndex = -1
        input.setAttribute('aria-hidden', 'true')
        Object.assign(input.style, {
          position: 'fixed',
          left: '0px',
          top: '0px',
          width: '1px',
          height: '1px',
          opacity: '0.001',
          pointerEvents: 'none',
          zIndex: '0',
        })
        document.body.appendChild(input)
        input.addEventListener('change', () => {
          const files = [...(input.files ?? [])]
          input.value = ''
          if (files.length === 0) return
          const transfer = new DataTransfer()
          files.forEach(file => transfer.items.add(file))
          document.dispatchEvent(new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }))
        })
        systemAttachmentInput = input
        return systemAttachmentInput
      }

      const hookComposerAdd = () => {
        const add = dshCompat.first('composerAdd', main)
        if (!(add instanceof HTMLElement) || add.dataset.dshIosAttachment === '1') return
        add.dataset.dshIosAttachment = '1'
        add.setAttribute('aria-label', '添加附件')
        add.removeAttribute('aria-haspopup')
        let lastPointerOpen = 0
        const consume = (event) => {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
        }
        const openSystemPicker = () => {
          setMenuOpen(false)
          const input = ensureSystemAttachmentInput()
          const rect = add.getBoundingClientRect()
          input.style.left = rect.left + 'px'
          input.style.top = rect.top + 'px'
          input.style.width = Math.max(1, rect.width) + 'px'
          input.style.height = Math.max(1, rect.height) + 'px'
          try {
            if (typeof input.showPicker === 'function') input.showPicker()
            else input.click()
          } catch (_) {
            input.click()
          }
        }
        add.addEventListener('pointerdown', (event) => {
          if (!mobileActive()) return
          consume(event)
          lastPointerOpen = Date.now()
          openSystemPicker()
        }, true)
        add.addEventListener('click', (event) => {
          if (!mobileActive()) return
          consume(event)
          if (Date.now() - lastPointerOpen < 700) return
          openSystemPicker()
        }, true)
      }

      const pinReaderToBottom = () => {
        const scrollBody = dshCompat.first('conversationScrollBody', main)
        if (!(scrollBody instanceof HTMLElement)) return
        readerPinnedToBottom = true
        readerAnchor = null
        const maxScrollTop = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight)
        if (Math.abs(scrollBody.scrollTop - maxScrollTop) > 0.5) scrollBody.scrollTop = maxScrollTop
      }

      const hookComposerInteractions = () => {
        const composerInputFrom = (target) => {
          if (!(target instanceof Element)) return null
          const input = dshCompat.closest(target, 'composerInput')
          return input instanceof HTMLTextAreaElement ? input : null
        }
        const handleInputIntent = (event) => {
          if (!mobileActive() || composerInputFrom(event.target) === null) return
          // Mobile chat input is an explicit "return to latest" action. Pin
          // before UIKit shrinks the native viewport so every keyboard open
          // starts from the same deterministic bottom state.
          pinReaderToBottom()
        }
        document.addEventListener('pointerdown', handleInputIntent, { capture: true, passive: true })
        document.addEventListener('focusin', handleInputIntent, true)
      }

      const captureReaderAnchor = (scrollBody) => {
        const maxScrollTop = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight)
        if (maxScrollTop - scrollBody.scrollTop <= 24) {
          readerPinnedToBottom = true
          readerAnchor = null
          return
        }
        readerPinnedToBottom = false
        const viewport = scrollBody.getBoundingClientRect()
        const row = [...scrollBody.querySelectorAll('[data-chat-anchor-key]')].find((candidate) => {
          if (!(candidate instanceof HTMLElement)) return false
          const rect = candidate.getBoundingClientRect()
          return rect.bottom > viewport.top && rect.top < viewport.bottom
        })
        if (!(row instanceof HTMLElement)) return
        readerAnchor = { key: row.dataset.chatAnchorKey, top: row.getBoundingClientRect().top }
      }
      const preserveReaderAnchor = (scrollBody, heightDelta = 0) => {
        if (readerPinnedToBottom) {
          const maxScrollTop = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight)
          if (Math.abs(scrollBody.scrollTop - maxScrollTop) > 0.5) scrollBody.scrollTop = maxScrollTop
          captureReaderAnchor(scrollBody)
          return
        }
        const anchor = readerAnchor
        if (anchor === null) {
          captureReaderAnchor(scrollBody)
          return
        }
        const row = [...scrollBody.querySelectorAll('[data-chat-anchor-key]')]
          .find((candidate) => candidate instanceof HTMLElement && candidate.dataset.chatAnchorKey === anchor.key)
        if (row instanceof HTMLElement) {
          // Keep the same reading context while letting the native viewport
          // physically push it with the keyboard. A shrinking viewport should
          // move the anchored content upward by the same amount; an expanding
          // viewport restores it in the opposite direction. This remains a
          // pure scroll-viewport response: no keyboard event or viewport API.
          const desiredTop = anchor.top - heightDelta
          const delta = row.getBoundingClientRect().top - desiredTop
          if (Math.abs(delta) > 0.5) scrollBody.scrollTop += delta
        }
        captureReaderAnchor(scrollBody)
      }
      const syncReaderResize = () => {
        const nextBody = dshCompat.first('conversationScrollBody', main)
        if (!(nextBody instanceof HTMLElement)) {
          readerResizeCleanup?.()
          readerResizeObserver?.disconnect()
          readerResizeBody = null
          readerViewportHeight = null
          return
        }
        if (readerResizeBody === nextBody) return
        readerResizeCleanup?.()
        readerResizeObserver?.disconnect()
        readerResizeBody = nextBody
        readerAnchor = null
        readerPinnedToBottom = false
        readerViewportHeight = nextBody.clientHeight
        const onScroll = () => captureReaderAnchor(nextBody)
        nextBody.addEventListener('scroll', onScroll, { passive: true })
        readerResizeCleanup = () => {
          nextBody.removeEventListener('scroll', onScroll)
          readerResizeCleanup = null
        }
        if (typeof ResizeObserver === 'undefined') {
          captureReaderAnchor(nextBody)
          return
        }
        readerResizeObserver = new ResizeObserver(() => {
          const nextHeight = nextBody.clientHeight
          const previousHeight = readerViewportHeight ?? nextHeight
          readerViewportHeight = nextHeight
          preserveReaderAnchor(nextBody, previousHeight - nextHeight)
        })
        readerResizeObserver.observe(nextBody)
        captureReaderAnchor(nextBody)
      }
      const buildActions = () => {
        const actions = []
        const hasTab = dshCompat.first('conversationTab') !== null
        if (hasTab) {
          actions.push({
            key: 'view-conv',
            label: () => '对话',
            active: () => conversationViewActive(),
            click: () => switchTab('对话'),
          })
          actions.push({
            key: 'view-trail',
            label: () => '轨迹',
            active: () => !conversationViewActive(),
            click: () => switchTab('轨迹'),
          })
        }
        if (dshCompat.first('sessionLogButton')) {
          actions.push({ key: 'session-log', label: () => '会话日志', click: () => clickFirst(dshCompat.selector('sessionLogButton')) })
        }
        if (dshCompat.first('workspaceButton')) {
          actions.push({ key: 'workspace', label: () => '工作区', click: () => clickFirst(dshCompat.selector('workspaceButton')) })
        }
        if (dshCompat.first('settingsTrigger')) {
          actions.push({
            key: 'settings',
            label: () => '设置',
            click: () => {
              const opened = clickFirst(dshCompat.selector('settingsTrigger'))
              if (opened) window.requestAnimationFrame(syncSettings)
            },
          })
        }
        return actions
      }

      const renderMenu = () => {
        if (!menuPanel) return
        const item = (action) => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'dsh-ios-native-menu-item'
          btn.dataset.dshIosMenuItem = action.key
          const label = action.label()
          btn.textContent = label
          btn.setAttribute('aria-label', label)
          if (action.active && action.active()) btn.setAttribute('data-dsh-ios-menu-active', 'true')
          btn.addEventListener('click', () => {
            setMenuOpen(false)
            if (action.click) action.click()
          })
          return btn
        }
        const title = document.createElement('div')
        title.className = 'dsh-ios-native-menu-title'
        title.textContent = '操作'
        menuPanel.replaceChildren(title)
        buildActions().forEach((action) => {
          menuPanel.appendChild(item(action))
        })
      }

      const setMenuOpen = (open) => {
        root.toggleAttribute('data-dsh-ios-menu-open', open)
        menuButton?.setAttribute('aria-expanded', String(open))
        if (open) {
          setSidebarOpen(false)
          renderMenu()
        }
      }

      const openPairing = () => {
        signalNative('dshOpenPairing')
        if (typeof window.Capacitor === 'undefined') {
          location.assign(location.origin + '/#dsh-reconnect=1')
        }
      }
      const clearSettingsPairingConfirm = () => {
        settingsPairingConfirm?.remove()
        settingsPairingConfirm = null
      }
      const showSettingsPairingConfirm = (content, entry) => {
        if (settingsPairingConfirm?.isConnected) return
        const confirm = document.createElement('div')
        confirm.className = 'dsh-ios-settings-pairing-confirm'
        confirm.setAttribute('role', 'alertdialog')
        confirm.setAttribute('aria-label', '确认重新配对')
        confirm.innerHTML = '<div class="dsh-ios-settings-pairing-confirm-message">确认重新配对主机？</div><div class="dsh-ios-settings-pairing-confirm-actions"><button type="button" data-dsh-ios-pairing-cancel>取消</button><button type="button" class="dsh-ios-settings-pairing-confirm-primary" data-dsh-ios-pairing-confirm>重新配对</button></div>'
        confirm.querySelector('[data-dsh-ios-pairing-cancel]')?.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          clearSettingsPairingConfirm()
        })
        confirm.querySelector('[data-dsh-ios-pairing-confirm]')?.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          clearSettingsPairingConfirm()
          openPairing()
        })
        if (entry.nextSibling) content.insertBefore(confirm, entry.nextSibling)
        else content.appendChild(confirm)
        settingsPairingConfirm = confirm
      }

      const ensureSettingsConnectionEntry = () => {
        const overlay = dshCompat.first('settingsOverlay')
        const content = dshCompat.first('settingsContent', overlay)
        if (!(content instanceof HTMLElement)) return
        if (settingsConnectionEntry?.isConnected) return

        const entry = document.createElement('button')
        entry.type = 'button'
        entry.className = 'dsh-ios-settings-connection'
        entry.setAttribute('data-dsh-ios-connection-entry', '')
        entry.setAttribute('aria-label', '更改当前主机连接')
        entry.innerHTML = `
          <span class="dsh-ios-settings-connection-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M7.5 14.5a4 4 0 1 1 3.3-6.27l8.7 0a1.5 1.5 0 0 1 0 3h-1.75v2h-2v-2h-2.08a4 4 0 0 1-6.17 3.27Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="7.5" cy="10.5" r="1" fill="currentColor"/>
            </svg>
          </span>
          <span class="dsh-ios-settings-connection-copy">
            <span class="dsh-ios-settings-connection-title">当前主机</span>
            <span class="dsh-ios-settings-connection-host"></span>
          </span>
          <svg class="dsh-ios-settings-connection-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`
        entry.querySelector('.dsh-ios-settings-connection-host').textContent = location.host
        entry.addEventListener('click', (event) => {
          showSettingsPairingConfirm(content, entry)
        })

        // This is a rare maintenance action, so keep it after ordinary
        // settings instead of promoting it to the first item on the page.
        content.appendChild(entry)
        settingsConnectionEntry = entry
      }

      const settingsGeneralActive = (overlay) => {
        const selected = overlay?.querySelector(
          '.VOzbGW_navCell[aria-current="true"], .VOzbGW_navCell[aria-selected="true"], .VOzbGW_navCell[data-active="true"], .VOzbGW_navCell.VOzbGW_active, .VOzbGW_navCell[class*="active"]',
        )
        const label = cleanText(selected?.textContent)
        return /通用|general/i.test(label)
      }

      const closeSettings = () => {
        const overlay = dshCompat.first('settingsOverlay')
        const back = [...(overlay?.querySelectorAll('button, [role="button"]') ?? [])]
          .find((element) => isVisible(element) && /^(返回|back\\b)/i.test(cleanText(element.getAttribute('aria-label'))))
        if (back instanceof HTMLElement) {
          back.click()
          return
        }
        const close = dshCompat.first('settingsClose', overlay)
        if (close instanceof HTMLElement) {
          close.click()
          return
        }
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
        }))
      }

      const expandSidebarContent = () => {
        const toggle = sidebar?.querySelector(
          '.hHd-Xa_root.hHd-Xa_collapsed button[aria-label="打开侧边栏"],' +
          '.hHd-Xa_root.hHd-Xa_collapsed button[aria-label="Open sidebar"]',
        )
        if (toggle instanceof HTMLElement) toggle.click()
      }

      const setSidebarOpen = (open) => {
        root.toggleAttribute('data-dsh-ios-sidebar-open', open)
        sidebarButton?.setAttribute('aria-expanded', String(open))
        sidebarButton?.setAttribute('aria-label', open ? '关闭侧边栏' : '打开侧边栏')
        if (open) {
          setMenuOpen(false)
          const reveal = () => {
            if (root.hasAttribute('data-dsh-ios-sidebar-open')) {
              syncFrame()
              expandSidebarContent()
            }
          }
          window.requestAnimationFrame(reveal)
        }
      }

      const drawerWidth = () => {
        const measured = sidebar?.getBoundingClientRect().width ?? 0
        return measured || Math.min(window.innerWidth * 0.86, 352)
      }

      const handleDrawerTouchStart = (event) => {
        if (!mobileActive() || root.hasAttribute('data-dsh-ios-settings-open')) return
        const touch = event.touches?.[0]
        if (!touch) return
        const open = root.hasAttribute('data-dsh-ios-sidebar-open')
        const target = event.target instanceof Node ? event.target : null
        const fromEdge = touch.clientX <= 24
        const fromDrawer = open && sidebar?.contains(target)
        if ((!open && !fromEdge) || (open && !fromDrawer)) return
        drawerGesture = {
          open,
          startX: touch.clientX,
          startY: touch.clientY,
          lastX: touch.clientX,
          width: drawerWidth(),
          active: false,
        }
      }

      const handleDrawerTouchMove = (event) => {
        if (!drawerGesture || !sidebar) return
        const touch = event.touches?.[0]
        if (!touch) return
        const dx = touch.clientX - drawerGesture.startX
        const dy = touch.clientY - drawerGesture.startY
        if (!drawerGesture.active) {
          if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 8) return
          const opening = !drawerGesture.open && dx > 0
          const closing = drawerGesture.open && dx < 0
          if (!opening && !closing) {
            drawerGesture = null
            return
          }
          drawerGesture.active = true
        }
        if (event.cancelable) event.preventDefault()
        drawerGesture.lastX = touch.clientX
      }

      const handleDrawerTouchEnd = () => {
        if (!drawerGesture) return
        const gesture = drawerGesture
        drawerGesture = null
        if (!gesture.active) return
        const distance = gesture.lastX - gesture.startX
        if (gesture.open) {
          setSidebarOpen(!(distance < -gesture.width * 0.28))
        } else {
          setSidebarOpen(distance > gesture.width * 0.28)
        }
      }

      const ensureChrome = () => {
        if (chrome || !document.body) return
        chrome = document.createElement('div')
        chrome.className = 'dsh-ios-native-chrome'
        chrome.innerHTML = `
          <div class="dsh-ios-native-backdrop" data-dsh-ios-backdrop></div>
          <div class="dsh-ios-native-topbar">
            <button type="button" class="dsh-ios-native-menu" data-dsh-ios-menu
                    aria-label="打开侧边栏" aria-expanded="false">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor"
                      stroke-width="1.9" stroke-linecap="round"/>
              </svg>
            </button>
            <button type="button" class="dsh-ios-native-menu-btn" data-dsh-ios-menu-btn
                    aria-label="更多操作" aria-expanded="false">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
              </svg>
            </button>
          </div>`
        document.body.appendChild(chrome)
        menuPanel = document.createElement('div')
        menuPanel.className = 'dsh-ios-native-menu-panel'
        menuPanel.setAttribute('role', 'menu')
        menuPanel.setAttribute('aria-label', '更多操作')
        renderMenu()
        chrome.appendChild(menuPanel)
        settingsBack = document.createElement('button')
        settingsBack.type = 'button'
        settingsBack.className = 'dsh-ios-native-settings-back'
        settingsBack.setAttribute('aria-label', '返回对话')
        settingsBack.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        document.body.appendChild(settingsBack)
        settingsBack.addEventListener('click', closeSettings)
        sidebarButton = chrome.querySelector('[data-dsh-ios-menu]')
        menuButton = chrome.querySelector('[data-dsh-ios-menu-btn]')
        sidebarButton?.addEventListener('click', () => {
          setSidebarOpen(!root.hasAttribute('data-dsh-ios-sidebar-open'))
        })
        menuButton?.addEventListener('click', (event) => {
          event.stopPropagation()
          setMenuOpen(!root.hasAttribute('data-dsh-ios-menu-open'))
        })
        menuPanel.addEventListener('click', (event) => event.stopPropagation())
        chrome.querySelector('[data-dsh-ios-backdrop]')?.addEventListener('click', () => setSidebarOpen(false))
        document.addEventListener('click', (event) => {
          const target = event.target instanceof Element ? event.target : null
          if (dshCompat.closest(target, 'settingsTrigger')) {
            window.requestAnimationFrame(syncSettings)
          }
          if (dshCompat.closest(target, 'settingsNavCell')) {
            window.requestAnimationFrame(syncSettings)
          }
          if (root.hasAttribute('data-dsh-ios-menu-open') &&
              !target?.closest('.dsh-ios-native-menu-panel, [data-dsh-ios-menu-btn]')) {
            setMenuOpen(false)
          }
        }, { passive: true })
        document.addEventListener('click', (event) => {
          const rawTarget = event.target instanceof Element ? event.target : null
          if (!rawTarget || !root.hasAttribute('data-dsh-ios-sidebar-open') ||
              root.hasAttribute('data-dsh-ios-settings-open') || !sidebar?.contains(rawTarget)) return
          const isDrawerLocalControl = (target, control) => {
            if (target.closest('[role="menu"], [role="listbox"], [role="dialog"], .qDHVXG_sectionHeader, .qDHVXG_search, .qDHVXG_headerActions, .qDHVXG_rowActions, .YDXeBa_rowActions')) return true
            if (target.closest('[role="treeitem"][aria-expanded]')) return true
            if (!(control instanceof HTMLElement)) return false
            return control.hasAttribute('aria-haspopup') || control.hasAttribute('aria-expanded')
          }

          const settingsTrigger = dshCompat.closest(rawTarget, 'settingsTrigger')
          if (settingsTrigger) {
            window.requestAnimationFrame(() => {
              if (dshCompat.first('settingsOverlay')) {
                setSidebarOpen(false)
                syncSettings()
              }
            })
            return
          }

          if (dshCompat.closest(rawTarget, 'settingsOverlay') || dshCompat.closest(rawTarget, 'sidebarToggle')) return

          const workspaceAdd = dshCompat.closest(rawTarget, 'composerAdd')
          if (workspaceAdd) {
            // Let the official handler create the popup, then remove the drawer
            // so its menu is not trapped under the iOS sidebar layer.
            window.requestAnimationFrame(() => setSidebarOpen(false))
            return
          }

          const control = rawTarget.closest('button, a, [role="button"]')
          if (isDrawerLocalControl(rawTarget, control)) return

          const navigationTarget = rawTarget.closest(
            '.hHd-Xa_newSession, .YDXeBa_sessionRow, .YDXeBa_searchResultRow, [role="treeitem"]:not([aria-expanded]), .pXSMma_workspace',
          )
          if (!navigationTarget) return

          // Run after the official React click handler so a session changes on
          // the first tap, while the drawer closes in the same interaction.
          window.requestAnimationFrame(() => setSidebarOpen(false))
        }, { passive: true })
        document.addEventListener('touchstart', handleDrawerTouchStart, { passive: true })
        document.addEventListener('touchmove', handleDrawerTouchMove, { passive: false })
        document.addEventListener('touchend', handleDrawerTouchEnd, { passive: true })
        document.addEventListener('touchcancel', handleDrawerTouchEnd, { passive: true })
      }

      const syncFrame = () => {
        if (!root) root = document.documentElement
        if (!root) return false
        root.toggleAttribute('data-dsh-ios-mobile', mobileActive())
        ensureChrome()

        const overlay = document.querySelector('[data-shell-overlay]')
        const sidebarRoot = dshCompat.first('sidebarRoot')
        const conversationRoot = dshCompat.first('conversationRoot')
        const nextFrame = overlay?.parentElement ??
          dshCompat.closest(sidebarRoot, 'frame') ??
          dshCompat.closest(conversationRoot, 'frame') ??
          dshCompat.first('frame')
        if (!nextFrame) return false
        const nextSidebar = dshCompat.directChild('sidebarColumn', nextFrame) ??
          sidebarRoot?.parentElement ?? nextFrame.firstElementChild
        const nextMain = dshCompat.directChild('mainColumn', nextFrame) ??
          dshCompat.closest(conversationRoot, 'mainColumn') ?? nextFrame.children[1]
        if (!nextSidebar || !nextMain) return false

        frame = nextFrame
        sidebar = nextSidebar
        main = nextMain
        frame.setAttribute('data-dsh-ios-frame', '')
        sidebar.setAttribute('data-dsh-ios-sidebar', '')
        main.setAttribute('data-dsh-ios-main', '')
        syncSessionReveal()
        hookComposerAdd()
        syncReaderResize()

        if (!mobileActive()) {
          setSidebarOpen(false)
        }
        return true
      }

      const syncSettings = () => {
        const overlay = dshCompat.first('settingsOverlay')
        // DSH mounts the Settings overlay only while it is open. Using DOM
        // presence avoids a circular dependency where the off-screen desktop
        // sidebar prevents isVisible() before the iOS full-screen rules apply.
        const open = overlay instanceof HTMLElement
        const general = open && settingsGeneralActive(overlay)
        root.toggleAttribute('data-dsh-ios-settings-open', open)
        root.toggleAttribute('data-dsh-ios-settings-general', general)
        settingsBack?.setAttribute('aria-hidden', String(!open))
        if (open) {
          setMenuOpen(false)
          setSidebarOpen(false)
          ensureSettingsConnectionEntry()
          if (!general) clearSettingsPairingConfirm()
        } else {
          clearSettingsPairingConfirm()
          settingsConnectionEntry = null
        }
      }

    const start = () => {
        root = document.documentElement
        if (started || !root || !document.body || !document.head) {
            // atDocumentStart may fire before head/body exist; retry shortly.
            if (!started) window.setTimeout(start, 25)
            return
        }
        started = true

        // WKUserScript.atDocumentStart may run before the React frame renders.
        // Enable the mobile shell immediately so the desktop rail/header never
        // becomes the visible fallback on iPhone, then let syncFrame attach to
        // the real frame once it appears.
        root.toggleAttribute('data-dsh-ios-mobile', mobileActive())
        root.toggleAttribute('data-dsh-ios-session-restoring', mobileActive())
        root.setAttribute('data-dsh-ios-compat-revision', '1')

        const style = document.createElement('style')
        style.id = 'dsh-ios-native-layout'
        style.textContent = css
        document.head.appendChild(style)

        hookComposerInteractions()

        let shellSyncQueued = false
        const scheduleShellSync = () => {
            if (shellSyncQueued) return
            shellSyncQueued = true
            window.requestAnimationFrame(() => {
                shellSyncQueued = false
                syncFrame()
                syncSettings()
                hookComposerAdd()
            })
        }

        const sidebarObserver = new MutationObserver(scheduleShellSync)
        sidebarObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-phase', 'aria-selected'] })

        media.addEventListener?.('change', syncFrame)
        window.addEventListener('resize', syncFrame, { passive: true })

        syncFrame()
        syncSettings()
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true })
    } else {
        start()
    }
    })()
    """

    private static let mobileThemeBootstrap = """
    (() => {
      const root = document.documentElement
      const media = window.matchMedia('(max-width: 900px)')
      const isMobileDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      const mobileActive = () => root.hasAttribute('data-dsh-ios-mobile') || isMobileDevice || media.matches
      const assets = { welcome: '__DSH_WELCOME_ART__' }

      if (!mobileActive()) return

      const css = `
        html[data-dsh-ios-mobile] {
          --dsh-ios-ocean-deep: #12255d;
          --dsh-ios-ocean: #2879e8;
          --dsh-ios-cyan: #58d9f5;
          --dsh-ios-water-soft: rgba(88, 217, 245, 0.16);
          --dsh-ios-ocean-soft: rgba(40, 121, 232, 0.12);
          --dsh-ios-ocean-border: rgba(76, 168, 242, 0.28);
        }

        html[data-dsh-ios-mobile] .dsh-ios-welcome-host {
          position: relative;
          border-radius: 32px;
          background:
            radial-gradient(circle at 16% 34%, rgba(88, 217, 245, 0.16) 0 3px, transparent 4px),
            radial-gradient(circle at 86% 24%, rgba(40, 121, 232, 0.12) 0 5px, transparent 6px),
            linear-gradient(150deg, rgba(255, 255, 255, 0.86), rgba(236, 249, 255, 0.64));
        }

        html[data-dsh-ios-mobile] .dsh-ios-welcome-host::before {
          content: '';
          position: absolute;
          right: 12%;
          top: 18%;
          width: 42px;
          height: 18px;
          border-top: 4px solid rgba(40, 121, 232, 0.16);
          border-right: 4px solid rgba(88, 217, 245, 0.18);
          border-radius: 90% 30% 90% 20%;
          transform: rotate(16deg);
          pointer-events: none;
        }

        html[data-dsh-ios-mobile] .dsh-ios-welcome-host::after {
          content: '';
          position: absolute;
          left: 12%;
          bottom: 16%;
          width: 24px;
          height: 24px;
          border: 3px solid rgba(88, 217, 245, 0.2);
          border-left-color: transparent;
          border-bottom-color: transparent;
          border-radius: 50%;
          transform: rotate(-24deg);
          pointer-events: none;
        }

        html[data-dsh-ios-mobile] .dsh-ios-welcome-art {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 8px);
          display: block;
          width: clamp(96px, 28vw, 132px);
          max-width: 32vw;
          height: auto;
          max-height: 132px;
          transform: translateX(-50%);
          object-fit: contain;
          pointer-events: none;
          user-select: none;
          z-index: 2;
          filter: drop-shadow(0 10px 18px rgba(40, 121, 232, 0.12));
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root,
        html[data-dsh-ios-mobile] .VOzbGW_panel {
          background:
            radial-gradient(circle at 88% 12%, rgba(88, 217, 245, 0.12) 0 4px, transparent 5px),
            linear-gradient(160deg, rgba(255, 255, 255, 0.84), rgba(236, 249, 255, 0.7)) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] [aria-current="page"],
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] [aria-selected="true"],
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] [data-active="true"],
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] [data-selected="true"],
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_active,
        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_selected {
          border-radius: 16px !important;
          color: var(--dsh-ios-ocean-deep) !important;
          background: linear-gradient(135deg, rgba(88, 217, 245, 0.22), rgba(40, 121, 232, 0.14)) !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 6px 18px rgba(40, 121, 232, 0.1) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_card {
          background:
            radial-gradient(circle at 87% 20%, rgba(88, 217, 245, 0.18) 0 3px, transparent 4px),
            radial-gradient(circle at 92% 14%, rgba(40, 121, 232, 0.13) 0 1.5px, transparent 2.5px),
            linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(237, 249, 255, 0.84)) !important;
          border-color: var(--dsh-ios-ocean-border) !important;
          box-shadow: 0 18px 38px rgba(40, 121, 232, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.86) !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_input {
          color: var(--dsh-ios-ocean-deep) !important;
          background: transparent !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_add,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_primary {
          color: #fff !important;
          background: transparent !important;
          box-shadow: none !important;
          isolation: isolate;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_add::before,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_primary::before {
          content: '';
          position: absolute;
          inset: 2px;
          z-index: -1;
          border-radius: 999px;
          background: linear-gradient(145deg, var(--dsh-ios-cyan), var(--dsh-ios-ocean));
          box-shadow: 0 8px 18px rgba(40, 121, 232, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.36);
          pointer-events: none;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .Sh0Q9G_trigger,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_trigger {
          color: var(--dsh-ios-ocean-deep) !important;
          border-color: transparent !important;
          background: transparent !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat::before,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_trigger::before {
          content: none !important;
          display: none !important;
          border: 0 !important;
          background: none !important;
          box-shadow: none !important;
          pointer-events: none;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .Sh0Q9G_trigger::before {
          content: none !important;
          display: none !important;
          border: 0 !important;
          background: none !important;
          box-shadow: none !important;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-menu,
        html[data-dsh-ios-mobile] .dsh-ios-native-menu-btn,
        html[data-dsh-ios-mobile] .dsh-ios-native-settings-back {
          color: var(--dsh-ios-ocean-deep) !important;
          border-color: var(--dsh-ios-ocean-border) !important;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(226, 247, 255, 0.78)) !important;
          box-shadow: 0 10px 24px rgba(40, 121, 232, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.86) !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell {
          border: 0 !important;
          border-radius: 0 !important;
          color: var(--dsh-ios-ocean-deep) !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell[aria-selected="true"],
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell[data-active="true"],
        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell[class*="active"] {
          color: var(--dsh-ios-ocean-deep) !important;
          background: transparent !important;
          box-shadow: inset 0 -2px 0 var(--dsh-ios-ocean) !important;
          font-weight: 600 !important;
        }
      `

      const addStyle = () => {
        if (document.getElementById('dsh-ios-native-theme')) return
        const style = document.createElement('style')
        style.id = 'dsh-ios-native-theme'
        style.textContent = css
        ;(document.head || document.documentElement).appendChild(style)
      }

      const isVisible = (element) => {
        if (!element) return false
        const computed = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return computed.display !== 'none' && computed.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }

      const normalizeText = (element) => (element?.textContent || '')
        .split(' ').join('').split(String.fromCharCode(10)).join('').split(String.fromCharCode(9)).join('').trim()
      const welcomeScope = () =>
        document.querySelector('[data-dsh-ios-main]') ??
        document.querySelector('.wSkVaW_root') ??
        null

      const findWelcomeHeading = () => {
        const scope = welcomeScope()
        if (!scope) return null
        const target = '探索未至之境'
        const candidates = Array.from(scope.querySelectorAll('*'))
          .filter((element) => {
            if (!isVisible(element)) return false
            const text = normalizeText(element)
            if (!text.includes(target)) return false
            return !Array.from(element.children).some((child) => normalizeText(child).includes(target))
          })
        const exact = candidates.filter((element) => normalizeText(element) === target)
        return (exact.length ? exact : candidates)
          .sort((a, b) => normalizeText(a).length - normalizeText(b).length)[0] || null
      }

      const welcomeHostStates = new WeakMap()
      const rememberWelcomeHost = (host) => {
        let state = welcomeHostStates.get(host)
        if (!state) {
          state = {
            position: host.style.position,
            overflow: host.style.overflow,
            positionApplied: false,
            overflowApplied: false,
          }
          welcomeHostStates.set(host, state)
        }
        return state
      }

      const cleanupWelcomeHost = (host) => {
        const state = welcomeHostStates.get(host)
        host.classList.remove('dsh-ios-welcome-host')
        if (!state) return
        if (state.positionApplied && host.style.position === 'relative') {
          host.style.position = state.position
        }
        if (state.overflowApplied && host.style.overflow === 'visible') {
          host.style.overflow = state.overflow
        }
        welcomeHostStates.delete(host)
      }

      const cleanupWelcomeHosts = (keep = null) => {
        document.querySelectorAll('.dsh-ios-welcome-host').forEach((node) => {
          if (node !== keep) cleanupWelcomeHost(node)
        })
      }

      const syncWelcome = () => {
        const existing = document.querySelector('.dsh-ios-welcome-art')
        const heading = findWelcomeHeading()
        if (!heading || !assets.welcome) {
          existing?.remove()
          cleanupWelcomeHosts()
          return
        }

        const host = heading.parentElement
        if (!host) return
        cleanupWelcomeHosts(host)
        if (existing?.parentElement === host) return
        existing?.remove()

        const state = rememberWelcomeHost(host)
        host.classList.add('dsh-ios-welcome-host')
        const computed = window.getComputedStyle(host)
        if (computed.position === 'static') {
          state.positionApplied = true
          host.style.position = 'relative'
        }
        if (computed.overflow === 'hidden') {
          state.overflowApplied = true
          host.style.overflow = 'visible'
        }

        const image = document.createElement('img')
        image.className = 'dsh-ios-welcome-art'
        image.src = assets.welcome
        image.alt = ''
        image.setAttribute('aria-hidden', 'true')
        image.draggable = false
        host.insertBefore(image, heading)
      }

      const nodeTouchesWelcomeScope = (node, scope) => {
        if (!(node instanceof Node)) return false
        return node === scope || scope.contains(node) || node.contains(scope)
      }

      const mutationTouchesWelcomeScope = (records) => {
        const scope = welcomeScope()
        if (!scope) {
          return records.some((record) => record.addedNodes.length > 0 || record.removedNodes.length > 0)
        }
        return records.some((record) => {
          if (nodeTouchesWelcomeScope(record.target, scope)) return true
          return [...record.addedNodes, ...record.removedNodes]
            .some((node) => nodeTouchesWelcomeScope(node, scope))
        })
      }

      const syncAll = () => {
        if (!mobileActive()) return
        addStyle()
        syncWelcome()
      }

      let syncQueued = false
      const scheduleSync = (records) => {
        if (!mutationTouchesWelcomeScope(records) || syncQueued) return
        syncQueued = true
        window.requestAnimationFrame(() => {
          syncQueued = false
          syncAll()
        })
      }

      const start = () => {
        syncAll()
        const observer = new MutationObserver(scheduleSync)
        observer.observe(document.documentElement, { childList: true, subtree: true })
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true })
      } else {
        start()
      }
    })()
    """

    private static func imageDataURL(named name: String) -> String {
        guard let image = UIImage(named: name),
              let data = image.pngData() else { return "" }
        return "data:image/png;base64,\(data.base64EncodedString())"
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let signalHandler = DSHWeakScriptMessageHandler(target: self)
        nativeSignalHandler = signalHandler
        configuration.userContentController.add(signalHandler, name: "dshNativeSignal")
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.viewportBootstrap,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.mobileLayoutBootstrap,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        let artworkScript = Self.mobileThemeBootstrap
            .replacingOccurrences(of: "__DSH_WELCOME_ART__", with: Self.imageDataURL(named: "DSHWelcomeCharacter"))
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: artworkScript,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )
        if UIDevice.current.userInterfaceIdiom == .phone {
            configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        }

        let webView = super.webView(with: frame, configuration: configuration)
        configureWebView(webView)
        return webView
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "dshNativeSignal",
              let body = message.body as? [String: Any],
              let event = body["event"] as? String else { return }

        var userInfo: [AnyHashable: Any] = ["event": event]
        if let host = body["host"] as? String { userInfo["host"] = host }
        if let detail = body["message"] as? String { userInfo["message"] = detail }
        NotificationCenter.default.post(
            name: .dshNativeSignal,
            object: self,
            userInfo: userInfo
        )
    }

    func showPairingLauncher() {
        guard let url = URL(string: "capacitor://localhost/#dsh-reconnect=1") else { return }
        webView?.load(URLRequest(url: url))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        if let webView = webView {
            configureWebView(webView)
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let webView = webView {
            configureWebView(webView)
        }
    }

    private func configureWebView(_ webView: WKWebView) {
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.alwaysBounceHorizontal = false
        webView.allowsBackForwardNavigationGestures = false
    }

}

private final class DSHLoadingView: UIView {
    private let backgroundGradientLayer = CAGradientLayer()
    private let contentStack = UIStackView()
    private let heroImageView = UIImageView(image: UIImage(named: "DSHLoadingCharacter"))
    private let titleLabel = UILabel()
    private let whaleTrackLoadingView = DSHWhaleTrackLoadingView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = DSHTheme.pale
        isAccessibilityElement = true
        accessibilityTraits = .updatesFrequently

        backgroundGradientLayer.colors = [
            UIColor.systemBackground.cgColor,
            DSHTheme.pale.withAlphaComponent(0.82).cgColor,
            UIColor(red: 218.0 / 255.0, green: 241.0 / 255.0, blue: 255.0 / 255.0, alpha: 1).cgColor,
        ]
        backgroundGradientLayer.locations = [0, 0.62, 1]
        backgroundGradientLayer.startPoint = CGPoint(x: 0.15, y: 0)
        backgroundGradientLayer.endPoint = CGPoint(x: 0.9, y: 1)
        layer.insertSublayer(backgroundGradientLayer, at: 0)

        contentStack.translatesAutoresizingMaskIntoConstraints = false
        contentStack.axis = .vertical
        contentStack.alignment = .center
        contentStack.distribution = .fill
        contentStack.spacing = 0

        heroImageView.translatesAutoresizingMaskIntoConstraints = false
        heroImageView.contentMode = .scaleAspectFit
        heroImageView.clipsToBounds = false
        heroImageView.accessibilityLabel = "DSH"
        heroImageView.setContentHuggingPriority(.defaultLow, for: .horizontal)
        heroImageView.setContentHuggingPriority(.defaultLow, for: .vertical)

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = .preferredFont(forTextStyle: .subheadline)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.textColor = .label
        titleLabel.textAlignment = .center
        titleLabel.text = "正在连接…"

        contentStack.addArrangedSubview(heroImageView)
        contentStack.addArrangedSubview(titleLabel)
        whaleTrackLoadingView.translatesAutoresizingMaskIntoConstraints = false
        contentStack.addArrangedSubview(whaleTrackLoadingView)
        contentStack.setCustomSpacing(6, after: heroImageView)
        contentStack.setCustomSpacing(10, after: titleLabel)
        addSubview(contentStack)

        NSLayoutConstraint.activate([
            contentStack.centerXAnchor.constraint(equalTo: safeAreaLayoutGuide.centerXAnchor),
            contentStack.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor, constant: -32),
            contentStack.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor, constant: 24),
            contentStack.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -24),
            contentStack.topAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.topAnchor, constant: 24),
            contentStack.bottomAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.bottomAnchor, constant: -24),
            heroImageView.widthAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.widthAnchor, multiplier: 0.82),
            heroImageView.heightAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.heightAnchor, multiplier: 0.54),
            heroImageView.widthAnchor.constraint(equalTo: heroImageView.heightAnchor, multiplier: 941.0 / 1672.0),
            whaleTrackLoadingView.widthAnchor.constraint(equalToConstant: 152),
            whaleTrackLoadingView.heightAnchor.constraint(equalToConstant: 22),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func update(title: String) {
        titleLabel.text = title
        accessibilityLabel = title
    }

    func startAnimating() {
        whaleTrackLoadingView.startAnimating()
    }

    func stopAnimating() {
        whaleTrackLoadingView.stopAnimating()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        backgroundGradientLayer.frame = bounds
    }
}

private final class DSHWhaleTrackLoadingView: UIView {
    private let trackLayer = CAShapeLayer()
    private let trackHighlightLayer = CAShapeLayer()
    private let whaleLayer = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isAccessibilityElement = true
        accessibilityLabel = "正在连接"
        backgroundColor = .clear
        trackLayer.fillColor = DSHTheme.ocean.withAlphaComponent(0.14).cgColor
        trackHighlightLayer.fillColor = DSHTheme.cyan.withAlphaComponent(0.58).cgColor
        whaleLayer.fillColor = DSHTheme.ocean.cgColor
        whaleLayer.strokeColor = UIColor.white.withAlphaComponent(0.72).cgColor
        whaleLayer.lineWidth = 0.8
        layer.addSublayer(trackLayer)
        layer.addSublayer(trackHighlightLayer)
        layer.addSublayer(whaleLayer)
    }

    func startAnimating() {
        layoutIfNeeded()
        stopAnimations()
        setWhalePosition()
        guard !UIAccessibility.isReduceMotionEnabled else {
            whaleLayer.opacity = 1
            trackHighlightLayer.opacity = 0.75
            return
        }

        let halfWidth = whaleLayer.bounds.width / 2
        let startX = halfWidth + 2
        let endX = max(startX, bounds.width - halfWidth - 2)
        let duration: CFTimeInterval = 1.6
        let move = CAKeyframeAnimation(keyPath: "position.x")
        move.values = [startX, endX, startX]
        move.keyTimes = [0, 0.78, 1]
        move.duration = duration
        move.repeatCount = .infinity
        whaleLayer.add(move, forKey: "dshWhaleTrackMove")

        let fade = CAKeyframeAnimation(keyPath: "opacity")
        fade.values = [0.18, 1, 0.18]
        fade.keyTimes = [0, 0.18, 1]
        fade.duration = duration
        fade.repeatCount = .infinity
        whaleLayer.add(fade, forKey: "dshWhaleTrackFade")

        let highlight = CAKeyframeAnimation(keyPath: "transform.translation.x")
        highlight.values = [0, max(0, bounds.width - 30), 0]
        highlight.keyTimes = [0, 0.78, 1]
        highlight.duration = duration
        highlight.repeatCount = .infinity
        trackHighlightLayer.add(highlight, forKey: "dshWhaleTrackHighlight")
    }

    func stopAnimating() {
        stopAnimations()
        whaleLayer.opacity = 1
        trackHighlightLayer.opacity = 0.75
        setWhalePosition()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let trackHeight: CGFloat = 5
        let trackRect = CGRect(x: 0, y: (bounds.height - trackHeight) / 2, width: bounds.width, height: trackHeight)
        trackLayer.frame = bounds
        trackLayer.path = UIBezierPath(roundedRect: trackRect, cornerRadius: trackHeight / 2).cgPath
        trackHighlightLayer.frame = bounds
        trackHighlightLayer.path = UIBezierPath(roundedRect: CGRect(x: 0, y: trackRect.minY, width: 30, height: trackHeight), cornerRadius: trackHeight / 2).cgPath
        whaleLayer.bounds = CGRect(x: 0, y: 0, width: 20, height: 14)
        whaleLayer.path = whalePath(in: whaleLayer.bounds).cgPath
        setWhalePosition()
    }

    private func stopAnimations() {
        whaleLayer.removeAllAnimations()
        trackHighlightLayer.removeAllAnimations()
    }

    private func setWhalePosition() {
        let halfWidth = whaleLayer.bounds.width / 2
        whaleLayer.position = CGPoint(
            x: bounds.width > 0 ? max(halfWidth + 2, min(bounds.width - halfWidth - 2, halfWidth + 2)) : 0,
            y: bounds.midY
        )
    }

    private func whalePath(in rect: CGRect) -> UIBezierPath {
        let body = CGRect(x: rect.midX - 5, y: rect.midY - 3, width: 10, height: 6)
        let path = UIBezierPath(ovalIn: body)
        path.move(to: CGPoint(x: body.minX + 1, y: body.midY))
        path.addLine(to: CGPoint(x: rect.minX + 1, y: body.minY))
        path.addLine(to: CGPoint(x: rect.minX + 3, y: body.midY))
        path.addLine(to: CGPoint(x: rect.minX + 1, y: body.maxY))
        path.close()
        return path
    }
}

final class DSHKeyboardViewportViewController: UIViewController {
    private let bridgeViewController = DSHBridgeViewController()
    private let loadingView = DSHLoadingView()
    private var isConnecting = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        if #available(iOS 17.0, *) {
            view.keyboardLayoutGuide.usesBottomSafeArea = false
        }

        addChild(bridgeViewController)
        let bridgeView = bridgeViewController.view!
        bridgeView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridgeView)
        NSLayoutConstraint.activate([
            bridgeView.topAnchor.constraint(equalTo: view.topAnchor),
            bridgeView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridgeView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bridgeView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
        ])
        bridgeViewController.didMove(toParent: self)

        loadingView.isHidden = true
        loadingView.alpha = 0
        view.addSubview(loadingView)
        NSLayoutConstraint.activate([
            loadingView.topAnchor.constraint(equalTo: view.topAnchor),
            loadingView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            loadingView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            loadingView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
        ])
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleNativeSignal(_:)),
            name: .dshNativeSignal,
            object: bridgeViewController
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self, name: .dshNativeSignal, object: bridgeViewController)
    }

    @objc private func handleNativeSignal(_ notification: Notification) {
        guard let event = notification.userInfo?["event"] as? String else { return }

        switch event {
        case "dshLauncherReady":
            if !isConnecting { setLoadingVisible(false) }
        case "dshConnectionStarting":
            let wasConnecting = isConnecting
            isConnecting = true
            loadingView.update(title: "正在连接…")
            if !wasConnecting {
                setLoadingVisible(true)
            }
        case "dshWebReady":
            isConnecting = false
            setLoadingVisible(false)
        case "dshConnectionFailed", "dshPairingRequired":
            isConnecting = false
            setLoadingVisible(false)
        case "dshOpenPairing":
            isConnecting = false
            setLoadingVisible(false)
            bridgeViewController.showPairingLauncher()
        default:
            break
        }
    }

    private func setLoadingVisible(_ visible: Bool) {
        if visible {
            loadingView.startAnimating()
            loadingView.isHidden = false
            UIView.animate(withDuration: 0.16) {
                self.loadingView.alpha = 1
            }
        } else {
            loadingView.stopAnimating()
            UIView.animate(withDuration: 0.16, animations: {
                self.loadingView.alpha = 0
            }, completion: { _ in
                if !self.isConnecting { self.loadingView.isHidden = true }
            })
        }
    }

    override var childForStatusBarStyle: UIViewController? {
        bridgeViewController
    }

    override var childForStatusBarHidden: UIViewController? {
        bridgeViewController
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = .systemBackground
        window?.rootViewController = DSHKeyboardViewportViewController()
        window?.rootViewController?.view.backgroundColor = .systemBackground
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
