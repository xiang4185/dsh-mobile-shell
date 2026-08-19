import UIKit
import Capacitor
import WebKit

final class DSHBridgeViewController: CAPBridgeViewController {
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

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .wSkVaW_scrollBody {
          box-sizing: border-box;
          min-height: 0 !important;
          padding-top: max(8px, var(--dsh-ios-safe-top)) !important;
          scroll-padding-top: calc(52px + var(--dsh-ios-safe-top));
          scroll-snap-type: y proximity;
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .wSkVaW_composerSeat,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] [data-composer-seat] {
          scroll-snap-align: end;
          scroll-snap-stop: always;
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
          z-index: 10030 !important;
          transition: left 260ms cubic-bezier(.32, .72, .28, 1) !important;
          border: 0 !important;
          background: transparent !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-sidebar] .hHd-Xa_root {
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
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          padding-top: var(--dsh-ios-safe-top) !important;
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
          border-radius: 16px !important;
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
          gap: 2px !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_modes {
          flex: 0 0 auto !important;
          min-width: 0 !important;
          max-width: 52px !important;
          gap: 2px !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_trailing {
          flex: none !important;
          width: 100% !important;
          gap: 2px !important;
          min-width: 0 !important;
          overflow: visible !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_add,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .Sh0Q9G_trigger,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] ._7KE1Ra_trigger {
          min-width: 40px !important;
          min-height: 40px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .Sh0Q9G_trigger {
          padding-inline: 8px 4px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat {
          max-width: 58px !important;
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
          font-size: 15px !important;
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

        @media (max-width: 390px) {
          html[data-dsh-ios-mobile] [data-dsh-ios-main] .cubgiG_seat {
            max-width: 44px !important;
          }
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_add,
        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_primary {
          box-sizing: border-box !important;
          flex: 0 0 40px !important;
          width: 40px !important;
          min-width: 40px !important;
          max-width: 40px !important;
          height: 40px !important;
          min-height: 40px !important;
          max-height: 40px !important;
          padding: 0 !important;
          border-radius: 50% !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .JObwrW_trigger {
          border-radius: 999px !important;
        }

        html[data-dsh-ios-mobile] [data-dsh-ios-main] .uV2eYG_primary {
          transform: none !important;
          background: var(--dsh-ios-accent) !important;
          color: #fff !important;
          box-shadow: 0 6px 16px rgba(0, 122, 255, 0.35) !important;
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
          z-index: 10010;
          pointer-events: none;
        }

        html[data-dsh-ios-mobile] .dsh-ios-native-topbar {
          box-sizing: border-box;
          position: relative;
          width: 100%;
          height: 100%;
          padding: 0;
          background: transparent;
          border: 0;
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
          pointer-events: auto;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-sidebar-open] .dsh-ios-native-backdrop {
          display: block;
          animation: dshIosFadeIn 200ms ease;
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
          z-index: 19990 !important;
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
          overflow: auto !important;
          z-index: 20000 !important;
          background: rgba(18, 20, 32, 0.35) !important;
          pointer-events: auto !important;
          touch-action: auto;
          isolation: isolate;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_panel {
          box-sizing: border-box !important;
          width: 100vw !important;
          max-width: 100vw !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          border-radius: 0 !important;
          overflow: hidden !important;
          flex-direction: column !important;
          -webkit-overflow-scrolling: touch !important;
          padding-bottom: var(--dsh-ios-safe-bottom) !important;
          background: var(--dsh-ios-glass) !important;
          border: 0 !important;
          box-shadow: none !important;
          -webkit-backdrop-filter: saturate(180%) blur(44px) !important;
          backdrop-filter: saturate(180%) blur(44px) !important;
          z-index: 2 !important;
          pointer-events: auto !important;
          touch-action: auto;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_panel * {
          pointer-events: auto !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_mask {
          pointer-events: auto !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_nav {
          box-sizing: border-box !important;
          width: 100% !important;
          flex: 0 0 auto !important;
          padding: calc(8px + var(--dsh-ios-safe-top)) 56px 8px !important;
          gap: 8px !important;
          border-bottom: 1px solid var(--dsh-ios-glass-border) !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navTitle {
          display: none !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navList {
          width: 100% !important;
          flex-direction: row !important;
          gap: 6px !important;
          overflow-x: auto !important;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navList::-webkit-scrollbar {
          display: none;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navCell {
          min-height: 44px !important;
          height: 44px !important;
          flex: 0 0 auto !important;
          padding: 9px 12px !important;
          justify-content: center !important;
          border-radius: 14px !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_navLabel {
          display: inline !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_content {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          width: 100% !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_header {
          flex: 0 0 auto !important;
          height: 48px !important;
          padding: 10px 14px 6px !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_close {
          width: 44px !important;
          height: 44px !important;
        }

        html[data-dsh-ios-mobile][data-dsh-ios-settings-open] .VOzbGW_options {
          min-width: 0 !important;
          padding: 4px 16px calc(28px + var(--dsh-ios-safe-bottom)) !important;
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
      let menuButton = null
      let menuPanel = null
      let systemAttachmentInput = null

      const cleanText = (value) => (value ?? '').replace(/\\s+/g, ' ').trim()
      const clickFirst = (sel) => {
        const el = document.querySelector(sel)
        if (el instanceof HTMLElement) el.click()
        return el instanceof HTMLElement
      }
      const findTab = (label) =>
        [...document.querySelectorAll('.wSkVaW_tab')].find(t => cleanText(t.textContent) === label) || null
      const switchTab = (label) => {
        const tab = findTab(label)
        if (tab instanceof HTMLElement) tab.click()
        window.setTimeout(scrollMessages, 120)
      }
      const conversationViewActive = () => {
        const conv = findTab('对话')
        return !conv || conv.classList.contains('wSkVaW_tabActive')
      }

      const messageScroller = () => main?.querySelector('.wSkVaW_scrollBody') ?? null

      const scrollMessages = () => {
        const scroller = messageScroller()
        if (scroller) scroller.scrollTop = scroller.scrollHeight
      }

      const ensureSystemAttachmentInput = () => {
        if (systemAttachmentInput?.isConnected) return systemAttachmentInput
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = 'image/*'
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
        const add = main?.querySelector('.uV2eYG_add')
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

      const buildActions = () => {
        const actions = []
        const hasTab = document.querySelector('.wSkVaW_tab') !== null
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
        if (document.querySelector('.nL4_yW_sessionLogButton')) {
          actions.push({ key: 'session-log', label: () => '会话日志', click: () => clickFirst('.nL4_yW_sessionLogButton') })
        }
        if (document.querySelector('.pXSMma_workspace')) {
          actions.push({ key: 'workspace', label: () => '工作区', click: () => clickFirst('.pXSMma_workspace') })
        }
        if (document.querySelector('.VOzbGW_trigger')) {
          actions.push({
            key: 'settings',
            label: () => '设置',
            click: () => {
              const opened = clickFirst('.VOzbGW_trigger')
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

      const closeSettings = () => {
        const close = document.querySelector('.VOzbGW_close, [aria-label="关闭"], [aria-label="Close"]')
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
        if (open) {
          setMenuOpen(false)
          const reveal = () => {
            if (root.hasAttribute('data-dsh-ios-sidebar-open')) {
              syncFrame()
              expandSidebarContent()
            }
          }
          window.requestAnimationFrame(reveal)
          window.setTimeout(reveal, 120)
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
        menuButton = chrome.querySelector('[data-dsh-ios-menu-btn]')
        menuButton?.addEventListener('click', (event) => {
          event.stopPropagation()
          setMenuOpen(!root.hasAttribute('data-dsh-ios-menu-open'))
        })
        menuPanel.addEventListener('click', (event) => event.stopPropagation())
        chrome.querySelector('[data-dsh-ios-menu]')?.addEventListener('click', () => setSidebarOpen(true))
        chrome.querySelector('[data-dsh-ios-backdrop]')?.addEventListener('click', () => setSidebarOpen(false))
        document.addEventListener('click', (event) => {
          const target = event.target instanceof Element ? event.target : null
          if (root.hasAttribute('data-dsh-ios-menu-open') &&
              !target?.closest('.dsh-ios-native-menu-panel, [data-dsh-ios-menu-btn]')) {
            setMenuOpen(false)
          }
        }, { passive: true })
        document.addEventListener('click', (event) => {
          const target = event.target instanceof Element
            ? event.target.closest('button, a, [role="button"]')
            : null
          if (!target || target.closest('.VOzbGW_trigger, .VOzbGW_overlay, .hHd-Xa_toggle, .uV2eYG_add') ||
              !target.closest('[data-dsh-ios-sidebar]')) return
          window.setTimeout(() => {
            if (!document.querySelector('.VOzbGW_overlay') &&
                !document.querySelector('[role="menu"]:not([hidden])')) {
              setSidebarOpen(false)
            }
          }, 0)
        }, { passive: true })
      }

      const syncFrame = () => {
        if (!root) root = document.documentElement
        if (!root) return false
        root.toggleAttribute('data-dsh-ios-mobile', mobileActive())
        ensureChrome()

        const overlay = document.querySelector('[data-shell-overlay]')
        const sidebarRoot = document.querySelector('.hHd-Xa_root')
        const conversationRoot = document.querySelector('.wSkVaW_root')
        const nextFrame = overlay?.parentElement ??
          sidebarRoot?.closest('.pI_x6G_frame') ??
          conversationRoot?.closest('.pI_x6G_frame') ??
          document.querySelector('.pI_x6G_frame')
        if (!nextFrame) return false
        const nextSidebar = nextFrame.querySelector(':scope > .pI_x6G_sidebarCol') ??
          sidebarRoot?.parentElement ?? nextFrame.firstElementChild
        const nextMain = nextFrame.querySelector(':scope > .pI_x6G_centerCol') ??
          conversationRoot?.closest('.pI_x6G_centerCol') ?? nextFrame.children[1]
        if (!nextSidebar || !nextMain) return false

        frame = nextFrame
        sidebar = nextSidebar
        main = nextMain
        frame.setAttribute('data-dsh-ios-frame', '')
        sidebar.setAttribute('data-dsh-ios-sidebar', '')
        main.setAttribute('data-dsh-ios-main', '')
        hookComposerAdd()

        if (!mobileActive()) {
          setSidebarOpen(false)
        }
        return true
      }

      const syncSettings = () => {
        const overlay = document.querySelector('.VOzbGW_overlay')
        const open = overlay !== null
        root.toggleAttribute('data-dsh-ios-settings-open', open)
        settingsBack?.setAttribute('aria-hidden', String(!open))
        if (open) {
          setMenuOpen(false)
          setSidebarOpen(false)
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

        const style = document.createElement('style')
        style.id = 'dsh-ios-native-layout'
        style.textContent = css
        document.head.appendChild(style)

        // Diagnostic stamp so the user can confirm injection ran on-device.
        const stamp = () => {
            try {
                const base = document.title || ''
                const mobile = root.hasAttribute('data-dsh-ios-mobile')
                const mark = mobile ? 'iOS-mobile' : 'iOS-DESKTOP'
                if (!base.includes(mark)) document.title = '[' + mark + '] ' + base
            } catch (err) { /* noop */ }
        }
        window.__dshIosDiagnostics = () => ({
            mobile: root.hasAttribute('data-dsh-ios-mobile'),
            ua: navigator.userAgent,
            frame: !!document.querySelector('[data-dsh-ios-frame]'),
            main: !!document.querySelector('[data-dsh-ios-main]'),
            innerWidth: window.innerWidth,
        })
        stamp()
        window.setTimeout(stamp, 800)
        window.setTimeout(stamp, 2500)

        const sidebarObserver = new MutationObserver(() => {
            syncFrame()
            syncSettings()
            hookComposerAdd()
            stamp()
        })
        sidebarObserver.observe(document.documentElement, { childList: true, subtree: true })

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

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
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
        if UIDevice.current.userInterfaceIdiom == .phone {
            configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        }

        let webView = super.webView(with: frame, configuration: configuration)
        configureWebView(webView)
        return webView
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

final class DSHKeyboardViewportViewController: UIViewController {
    private let bridgeViewController = DSHBridgeViewController()

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
