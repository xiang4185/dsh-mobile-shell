window.__ModuleLoader__.load({
  id: 'dsh-mobile-ui',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')

    const BREAKPOINT = 820
    const QUICK_PRESETS = [
      { id: 'standard', label: '标准模式', description: '完整工具与文件能力' },
      { id: 'code', label: 'PTC 模式', description: '复杂编码和多步骤操作' },
      { id: 'minimal', label: '极简模式', description: '简单修改和快速任务' },
    ]

    const CSS = `
      .dsh-mobile-root-chrome { display: none; }

      @media (max-width: ${BREAKPOINT}px) {
        html, body, #root {
          box-sizing: border-box;
          width: 100%;
          max-width: 100vw;
          height: 100%;
          overflow-x: hidden !important;
          overscroll-behavior-x: none;
        }

        html, body {
          touch-action: pan-y pinch-zoom;
        }

        body {
          position: relative;
          margin: 0;
          overflow-y: hidden;
        }

        :root {
          --dsh-mobile-safe-top: env(safe-area-inset-top, 0px);
          --dsh-mobile-safe-bottom: env(safe-area-inset-bottom, 0px);
          --dsh-mobile-drawer-width: min(84vw, 336px);
        }

        [data-dsh-mobile-frame] {
          box-sizing: border-box;
          width: 100% !important;
          max-width: 100vw !important;
          min-width: 0 !important;
          grid-template-columns: 0 minmax(0, 1fr) 0 !important;
          overflow: hidden !important;
          overscroll-behavior-x: none;
        }

        /* ============ Desktop sidebar: parked off-screen ============
           We no longer reuse the desktop sidebar as the drawer. It is
           collapsed to zero width (no transform — a transform would
           re-anchor fixed descendants such as the Settings overlay away
           from the viewport) and its in-flow content is clipped away.
           Fixed overlays rendered inside its subtree (Settings) still
           anchor to the viewport and remain usable. */
        [data-dsh-mobile-frame] > :first-child {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          bottom: auto !important;
          width: 0 !important;
          min-width: 0 !important;
          height: 100dvh !important;
          overflow: hidden !important;
          border-right: none !important;
          background: transparent !important;
          transform: none !important;
          z-index: 1;
        }

        [data-dsh-mobile-frame] > :nth-child(2) {
          box-sizing: border-box;
          grid-column: 2;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          padding-top: calc(var(--dsh-mobile-safe-top) + 52px);
          overflow-x: hidden !important;
        }

        [data-dsh-mobile-frame] > :nth-child(3) {
          grid-column: 3;
        }

        [data-dsh-mobile-frame] > [data-side] {
          display: none !important;
        }

        [data-dsh-mobile-frame] [data-phase] {
          box-sizing: border-box;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-x: hidden !important;
          --dsh-chat-content-width: 100%;
          --dsh-composer-card-max-width: 100%;
          --dsh-composer-side-clearance: 10px;
        }

        [data-dsh-mobile-frame] [data-phase] > *,
        [data-dsh-mobile-frame] [data-conversation-scroll],
        [data-dsh-mobile-frame] [data-composer-seat],
        [data-dsh-mobile-frame] [data-composer-card],
        .dsh-mobile-preset-dock,
        .dsh-mobile-preset-row {
          box-sizing: border-box;
          max-width: 100% !important;
          min-width: 0 !important;
        }

        /* ============ Mobile hero ============
           Brand block on top, presets + composer pinned to the bottom. */
        [data-dsh-mobile-frame] [data-phase="hero"] [data-conversation-scroll] {
          flex-direction: column !important;
          justify-content: flex-start !important;
        }

        [data-dsh-mobile-frame] [data-phase="hero"] .pXSMma_root,
        [data-dsh-mobile-frame] [data-phase="hero"] .wSkVaW_heroWorkspaceRow {
          display: none !important;
        }

        [data-dsh-mobile-frame] [data-phase="hero"] .wSkVaW_composerHero {
          box-sizing: border-box;
          width: auto !important;
          max-width: none !important;
          align-self: stretch !important;
          margin: 0 !important;
          gap: 10px !important;
          padding: 0 12px 10px !important;
        }

        [data-dsh-mobile-frame] [data-phase="hero"] .uV2eYG_hero {
          box-sizing: border-box;
          width: 100%;
          padding: 0 !important;
        }

        [data-dsh-mobile-frame] [data-phase="hero"] .uV2eYG_hero .uV2eYG_mirror {
          min-height: 38px !important;
        }

        [data-dsh-mobile-frame] [data-phase="hero"] [data-composer-card] {
          width: 100% !important;
          max-width: none !important;
          gap: 6px !important;
          padding-top: 8px !important;
          border-radius: 20px !important;
        }

        /* Workspace Write (mode switch) stays reachable on phones, but
           compacts: icon-first, label wraps onto its own line only when
           space allows. */
        [data-dsh-mobile-frame] .uV2eYG_modes {
          display: inline-flex !important;
          min-width: 0 !important;
          max-width: 138px !important;
          overflow: hidden !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          font-size: 12px !important;
          padding: 6px 10px !important;
        }

        [data-dsh-mobile-frame] .uV2eYG_tools {
          gap: 6px !important;
          padding-left: 2px !important;
          min-width: 0 !important;
          flex-shrink: 1 !important;
        }

        [data-dsh-mobile-frame] .uV2eYG_tools > :not(.uV2eYG_modes) {
          flex-shrink: 0 !important;
        }

        [data-dsh-mobile-frame] .uV2eYG_row {
          gap: 8px !important;
          padding-left: 10px !important;
          padding-right: 10px !important;
        }

        [data-dsh-mobile-frame] .uV2eYG_trailing {
          gap: 7px !important;
          min-width: 0 !important;
          flex-shrink: 1 !important;
          overflow: hidden !important;
        }

        [data-dsh-mobile-frame] .uV2eYG_trailing > * {
          min-width: 0 !important;
        }

        [data-dsh-mobile-frame] [data-phase="active"] > :first-child {
          padding: 0 12px;
        }

        [data-dsh-mobile-frame] [data-phase="active"] > :first-child > :first-child {
          display: none;
        }

        [data-dsh-mobile-frame] [data-phase="active"] > :first-child > :last-child {
          margin-top: 0;
          padding-left: 2px;
          gap: 26px;
        }

        [data-dsh-mobile-frame] [data-conversation-scroll] {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: hidden;
          overscroll-behavior-x: none;
          touch-action: pan-y pinch-zoom;
        }

        [data-dsh-mobile-frame] [data-composer-seat] {
          box-sizing: border-box;
          padding-bottom: var(--dsh-mobile-safe-bottom);
        }

        /* The iOS keyboard already owns the bottom safe area. Keeping the
           hardware-safe padding here creates a second, very visible gap. */
        html[data-dsh-keyboard-open] [data-dsh-mobile-frame] [data-composer-seat] {
          padding-bottom: 0 !important;
        }

        /* Runtime stats are useful at rest, but while typing they just push the
           composer away from the keyboard. Restore them as soon as it closes. */
        html[data-dsh-keyboard-open] [data-dsh-mobile-frame] .FJxK0a_root {
          display: none !important;
        }

        html[data-dsh-keyboard-open] [data-dsh-mobile-frame] .wSkVaW_composerStack {
          --dsh-composer-stack-gap: 2px !important;
        }

        [data-dsh-mobile-frame] [data-composer-card] {
          border-radius: 20px;
        }

        /* ============ Mobile chrome (top bar + backdrop) ============ */
        .dsh-mobile-chrome {
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 35;
        }

        .dsh-mobile-root-chrome {
          display: block;
          pointer-events: none;
          position: fixed;
          inset: 0;
          width: 100vw;
          max-width: 100vw;
          overflow: hidden;
          z-index: 1000;
        }

        .dsh-mobile-topbar {
          box-sizing: border-box;
          pointer-events: auto;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          width: 100vw;
          max-width: 100vw;
          z-index: 1001;
          height: calc(var(--dsh-mobile-safe-top) + 52px);
          padding: var(--dsh-mobile-safe-top) 12px 0;
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) 44px;
          align-items: center;
          background: color-mix(in srgb, var(--dsw-alias-bg-base) 94%, transparent);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-bottom: 1px solid var(--dsw-alias-border-l1);
        }

        .dsh-mobile-topbar-title {
          min-width: 0;
          text-align: center;
          color: var(--dsw-alias-label-primary);
          font-size: 15px;
          font-weight: 600;
          line-height: 20px;
          text-overflow: ellipsis;
          white-space: nowrap;
          overflow: hidden;
        }

        .dsh-mobile-icon-button {
          width: 40px;
          height: 40px;
          border: 0;
          border-radius: 12px;
          padding: 0;
          display: grid;
          place-items: center;
          cursor: pointer;
          color: var(--dsw-alias-label-primary);
          background: transparent;
          -webkit-tap-highlight-color: transparent;
        }

        .dsh-mobile-icon-button:active {
          background: var(--dsw-alias-interactive-bg-hover);
        }

        .dsh-mobile-backdrop {
          pointer-events: auto;
          position: fixed;
          inset: 0;
          z-index: 1200;
          border: 0;
          padding: 0;
          background: rgba(0, 0, 0, .22);
          opacity: 0;
          visibility: hidden;
          transition: opacity .18s ease, visibility .18s ease;
        }

        .dsh-mobile-root-chrome[data-open] .dsh-mobile-backdrop {
          opacity: 1;
          visibility: visible;
        }

        /* When the drawer or the Settings panel is open, the top bar must
           step aside: drawer keeps a 16vw sliver of the screen visible on
           the right where the topbar would otherwise bleed through the
           translucent backdrop, and the Settings panel would otherwise
           hide its own close button under the topbar's z-index. */
        .dsh-mobile-root-chrome[data-open] .dsh-mobile-topbar {
          opacity: 0;
          pointer-events: none;
        }

        body[data-dsh-mobile-settings-open] .dsh-mobile-topbar {
          display: none !important;
        }

        /* ============ Mobile drawer (session list) ============ */
        .dsh-mobile-drawer {
          box-sizing: border-box;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--dsh-mobile-drawer-width);
          max-width: 84vw;
          z-index: 1300;
          display: flex;
          flex-direction: column;
          background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base));
          color: var(--dsw-alias-label-primary);
          padding-top: var(--dsh-mobile-safe-top);
          padding-bottom: var(--dsh-mobile-safe-bottom);
          transform: translateX(-105%);
          transition: transform .22s var(--ds-ease-in-out, ease);
          box-shadow: 14px 0 38px rgba(0, 0, 0, .14);
          visibility: hidden;
          overflow: hidden;
        }

        .dsh-mobile-drawer[data-open] {
          transform: translateX(0);
          visibility: visible;
        }

        .dsh-mobile-drawer-head {
          box-sizing: border-box;
          flex: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 10px 6px 18px;
        }

        .dsh-mobile-drawer-brand {
          display: flex;
          align-items: baseline;
          gap: 7px;
          min-width: 0;
        }

        .dsh-mobile-drawer-brand strong {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -.3px;
          color: var(--dsw-alias-label-primary);
        }

        .dsh-mobile-drawer-brand span {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--dsw-alias-label-caption);
        }

        .dsh-mobile-new-session {
          box-sizing: border-box;
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 44px;
          margin: 4px 12px 10px;
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 14px;
          background: var(--dsw-alias-button-elevated-fill);
          color: var(--dsw-alias-label-primary);
          font: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .dsh-mobile-new-session:active {
          background: var(--dsw-alias-button-floating-hover);
        }

        .dsh-mobile-drawer-section {
          flex: none;
          margin: 2px 18px 6px;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: .6px;
          text-transform: uppercase;
          color: var(--dsw-alias-label-caption);
        }

        .dsh-mobile-drawer-tools {
          box-sizing: border-box;
          flex: none;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 2px 12px 10px;
        }

        .dsh-mobile-drawer-search {
          box-sizing: border-box;
          flex: 1;
          min-width: 0;
          height: 38px;
          padding: 0 13px;
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 12px;
          background: var(--dsw-alias-input-fill, transparent);
          color: var(--dsw-alias-label-primary);
          font: inherit;
          font-size: 13.5px;
          -webkit-tap-highlight-color: transparent;
        }

        .dsh-mobile-drawer-search::placeholder {
          color: var(--dsw-alias-label-caption);
        }

        .dsh-mobile-drawer-search:focus {
          outline: none;
          border-color: var(--dsw-alias-state-business-primary);
        }

        .dsh-mobile-drawer-refresh {
          box-sizing: border-box;
          flex: none;
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 12px;
          background: transparent;
          color: var(--dsw-alias-label-primary);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .dsh-mobile-drawer-refresh:active {
          background: var(--dsw-alias-interactive-bg-hover);
        }

        .dsh-mobile-drawer-refresh svg {
          width: 17px;
          height: 17px;
        }

        .dsh-mobile-drawer-refresh[data-busy] svg {
          animation: dsh-mobile-spin .8s linear infinite;
        }

        @keyframes dsh-mobile-spin {
          to { transform: rotate(360deg); }
        }

        .dsh-mobile-drawer-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 2px 8px 8px;
        }

        .dsh-mobile-session-item {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          min-height: 48px;
          padding: 9px 10px;
          border: 0;
          border-radius: 13px;
          background: transparent;
          color: var(--dsw-alias-label-primary);
          text-align: left;
          font: inherit;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .dsh-mobile-session-item:active {
          background: var(--dsw-alias-interactive-bg-hover);
        }

        .dsh-mobile-session-item[data-current] {
          background: var(--dsw-alias-state-business-tertiary);
        }

        .dsh-mobile-session-item-text {
          flex: 1;
          min-width: 0;
        }

        .dsh-mobile-session-item-title {
          font-size: 14px;
          font-weight: 500;
          line-height: 20px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dsh-mobile-session-item-time {
          margin-top: 1px;
          font-size: 11.5px;
          line-height: 16px;
          color: var(--dsw-alias-label-caption);
        }

        .dsh-mobile-session-item[data-current] .dsh-mobile-session-item-time {
          color: var(--dsw-alias-state-business-primary);
        }

        .dsh-mobile-session-empty {
          padding: 26px 18px;
          text-align: center;
          font-size: 13px;
          line-height: 20px;
          color: var(--dsw-alias-label-caption);
        }

        .dsh-mobile-drawer-foot {
          flex: none;
          padding: 8px 12px calc(var(--dsh-mobile-safe-bottom) + 8px);
          border-top: 1px solid var(--dsw-alias-border-l1);
        }

        .dsh-mobile-drawer-settings {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          height: 42px;
          padding: 0 10px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: var(--dsw-alias-label-primary);
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .dsh-mobile-drawer-settings:active {
          background: var(--dsw-alias-interactive-bg-hover);
        }

        /* ============ Hero brand block ============ */
        .dsh-mobile-hero-brand {
          box-sizing: border-box;
          width: 100%;
          margin-bottom: auto;
          padding: 6vh 24px 0;
          text-align: center;
        }

        .dsh-mobile-hero-logo {
          display: inline-grid;
          place-items: center;
          width: 58px;
          height: 58px;
          margin-bottom: 20px;
          border-radius: 17px;
          background: linear-gradient(135deg, var(--dsw-alias-state-business-primary) 0%, #8b5cf6 100%);
          color: #ffffff;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -.4px;
        }

        .dsh-mobile-hero-title {
          margin: 0 0 9px;
          font-size: 21px;
          font-weight: 700;
          line-height: 28px;
          letter-spacing: -.2px;
          color: var(--dsw-alias-label-primary);
        }

        .dsh-mobile-hero-sub {
          margin: 0 auto;
          max-width: 280px;
          font-size: 13.5px;
          line-height: 21px;
          color: var(--dsw-alias-label-secondary);
        }

        /* ============ Preset dock spacing ============ */
        .dsh-mobile-preset-dock {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          margin: 0 auto;
          padding: 0 0 2px;
          overflow: hidden;
        }

        .dsh-mobile-preset-title {
          margin: 0 0 8px 2px;
          color: var(--dsw-alias-label-secondary);
          font-size: 13px;
          line-height: 18px;
        }

        .dsh-mobile-preset-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          width: 100%;
          min-width: 0;
        }

        .dsh-mobile-preset-button {
          box-sizing: border-box;
          min-width: 0;
          height: 38px;
          padding: 0 5px;
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 13px;
          color: var(--dsw-alias-label-primary);
          background: var(--dsw-specific-input-major);
          font: inherit;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          text-overflow: ellipsis;
          white-space: nowrap;
          overflow: hidden;
          -webkit-tap-highlight-color: transparent;
        }

        .dsh-mobile-preset-button[data-selected="true"] {
          color: var(--dsw-alias-state-business-primary);
          border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 36%, transparent);
          background: var(--dsw-alias-state-business-tertiary);
        }

        .dsh-mobile-preset-button:disabled {
          opacity: .5;
          cursor: default;
        }

        .dsh-mobile-preset-desc {
          min-height: 18px;
          margin: 7px 2px 0;
          color: var(--dsw-alias-label-caption);
          font-size: 12px;
          line-height: 18px;
        }

        /* Neutralize containing-blocks inside the parked desktop sidebar.
           dsh leaves an identity transform (matrix(1,0,0,1,0,0)) on the
           sidebar root after collapse animations. ANY non-none transform
           creates a containing block, which captures position:fixed
           descendants — the Settings overlay then shrinks to the 20px
           sidebar box and appears "embedded in the chat". Since the
           sidebar is visually hidden at mobile widths, killing transforms
           in its subtree is harmless. */
        [data-dsh-mobile-frame] [data-side],
        [data-dsh-mobile-frame] [data-side] * {
          transform: none !important;
          filter: none !important;
          perspective: none !important;
          backface-visibility: visible !important;
        }

        /* The Settings overlay lives inside the parked sidebar column
           (.pI_x6G_sidebarCol, z-index:1). The composer's inner stack
           (.wSkVaW_composerStack) is also z-index:1 at the root stacking
           context, and it comes LATER in DOM order — so the composer
           renders ON TOP of the full-screen Settings panel (the panel
           never wins regardless of its own z-index). Lift the sidebar
           column above everything while the frame is in mobile layout.
           The column is visually hidden (width:0) at these widths, so the
           boost is harmless. */
        [data-dsh-mobile-frame] [data-side] {
          z-index: 9000 !important;
        }

        /* ============ Settings overlay: full-viewport fixed container ============ */
        .VOzbGW_overlay {
          position: fixed !important;
          inset: 0 !important;
          z-index: 8000 !important;
          background: rgba(0, 0, 0, 0.45) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }

        /* ============ Settings panel: go full-screen ============ */
        .VOzbGW_panel {
          width: 100vw !important;
          max-width: 100vw !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          border-radius: 0 !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }

        .VOzbGW_nav {
          width: 66px !important;
          padding: 16px 10px 0 !important;
          gap: 12px !important;
        }

        .VOzbGW_navTitle {
          display: none !important;
        }

        .VOzbGW_navCell {
          padding: 9px 10px !important;
          justify-content: center !important;
        }

        .VOzbGW_navLabel {
          display: none !important;
        }

        .VOzbGW_options {
          padding: 0 14px 22px !important;
        }

        /* ============ Internal testing notice: compact on mobile ============ */
        .jLrgrW_dialog {
          width: calc(100vw - 28px) !important;
          max-width: 100vw !important;
          border-radius: 18px !important;
        }

        .jLrgrW_content {
          padding: 16px !important;
        }

        .jLrgrW_copy {
          font-size: 13px !important;
          line-height: 20px !important;
        }

        .jLrgrW_dialog button {
          min-height: 42px !important;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .dsh-mobile-backdrop,
        .dsh-mobile-drawer { transition: none !important; }
      }
    `

    function useMobile() {
      const query = `(max-width: ${BREAKPOINT}px)`
      const [mobile, setMobile] = React.useState(() => (
        typeof window !== 'undefined' && window.matchMedia(query).matches
      ))

      React.useEffect(() => {
        const media = window.matchMedia(query)
        const changed = () => setMobile(media.matches)
        changed()
        media.addEventListener?.('change', changed)
        return () => media.removeEventListener?.('change', changed)
      }, [query])

      return mobile
    }

    function iconMenu() {
      return React.createElement('svg', {
        width: 23, height: 23, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      React.createElement('path', {
        d: 'M4 7h16M4 12h16M4 17h16', stroke: 'currentColor', strokeWidth: 1.9,
        strokeLinecap: 'round',
      }))
    }

    function iconPlus() {
      return React.createElement('svg', {
        width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      React.createElement('path', {
        d: 'M12 5v14M5 12h14', stroke: 'currentColor', strokeWidth: 1.9,
        strokeLinecap: 'round',
      }))
    }

    function iconClose() {
      return React.createElement('svg', {
        width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      React.createElement('path', {
        d: 'M6 6l12 12M18 6L6 18', stroke: 'currentColor', strokeWidth: 1.9,
        strokeLinecap: 'round',
      }))
    }

    function iconGear() {
      return React.createElement('svg', {
        width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
      },
      React.createElement('path', {
        d: 'M12 15a3 3 0 100-6 3 3 0 000 6z', stroke: 'currentColor', strokeWidth: 1.7,
      }),
      React.createElement('path', {
        d: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
        stroke: 'currentColor', strokeWidth: 1.5,
      }))
    }

    function timeAgo(ts) {
      if (!ts) return ''
      const diff = Math.max(0, Date.now() - ts)
      const minutes = Math.floor(diff / 60000)
      if (minutes < 1) return '刚刚'
      if (minutes < 60) return `${minutes} 分钟前`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours} 小时前`
      const days = Math.floor(hours / 24)
      if (days < 7) return `${days} 天前`
      const weeks = Math.floor(days / 7)
      return `${weeks} 周前`
    }

    function sessionTitle(summary) {
      if (!summary) return ''
      if (summary.blank) return '新对话'
      return summary.displayTitle || summary.title || '新对话'
    }

    function svgClose() {
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
    }

    function svgPlus() {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
    }

    function svgGear() {
      return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.5"/></svg>'
    }

    function QuickPresetDock({ useSessions, sessionId, loadPresets, selectPreset }) {
      const mobile = useMobile()
      const summary = useSessions((state) => state.byId[sessionId])
      const [available, setAvailable] = React.useState([])
      const [selected, setSelected] = React.useState(summary?.agentPreset ?? '')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        setSelected(summary?.agentPreset ?? '')
      }, [summary?.agentPreset])

      React.useEffect(() => {
        if (!mobile || summary?.blank !== true) return
        let live = true
        loadPresets().then((ids) => {
          if (live) setAvailable(ids)
        }).catch((cause) => {
          if (live) setError(cause instanceof Error ? cause.message : String(cause))
        })
        return () => { live = false }
      }, [mobile, summary?.blank])

      if (!mobile || summary?.blank !== true) return null

      const visible = QUICK_PRESETS.filter((preset) => available.includes(preset.id))
      if (visible.length === 0) return null
      const active = QUICK_PRESETS.find((preset) => preset.id === selected)

      return React.createElement('div', { className: 'dsh-mobile-preset-dock' },
        React.createElement('div', { className: 'dsh-mobile-preset-title' }, '选择 Agent 预设'),
        React.createElement('div', { className: 'dsh-mobile-preset-row' },
          visible.map((preset) => React.createElement('button', {
            key: preset.id,
            type: 'button',
            className: 'dsh-mobile-preset-button',
            'data-selected': selected === preset.id ? 'true' : 'false',
            disabled: busy,
            onClick: async () => {
              if (busy || selected === preset.id) return
              setBusy(true)
              setError('')
              try {
                const applied = await selectPreset(preset.id)
                setSelected(applied)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause))
              } finally {
                setBusy(false)
              }
            },
          }, preset.label)),
        ),
        React.createElement('div', { className: 'dsh-mobile-preset-desc', role: error ? 'alert' : undefined },
          error || active?.description || '选择后将用于这个新会话',
        ),
      )
    }

    const inject = ['slots', 'layout', 'workspaces', 'sessions', 'connection']

    function apply(ctx) {
      if (typeof document !== 'undefined') {
        const viewport = document.querySelector('meta[name="viewport"]')
        if (viewport) {
          const before = viewport.getAttribute('content') ?? ''
          if (!/(?:^|,)\s*viewport-fit\s*=/.test(before)) {
            const next = before.trim() === '' ? 'viewport-fit=cover' : `${before}, viewport-fit=cover`
            viewport.setAttribute('content', next)
            ctx.effect(() => () => viewport.setAttribute('content', before))
          }
        }

        let touchStartX = 0
        let touchStartY = 0
        let touchTarget = null
        let touchStartedInEditor = false

        const isEditing = () => {
          const active = document.activeElement
          if (!(active instanceof Element)) return false
          return active.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ||
            active.closest('[data-composer-card]') !== null
        }

        const keyboardLikelyOpen = () => {
          const viewport = window.visualViewport
          if (!viewport) return false
          return viewport.height < window.innerHeight * 0.82
        }

        const syncKeyboardState = () => {
          document.documentElement.toggleAttribute('data-dsh-keyboard-open', keyboardLikelyOpen())
        }
        syncKeyboardState()
        window.visualViewport?.addEventListener('resize', syncKeyboardState, { passive: true })
        window.visualViewport?.addEventListener('scroll', syncKeyboardState, { passive: true })
        window.addEventListener('focusin', syncKeyboardState, { passive: true })
        window.addEventListener('focusout', syncKeyboardState, { passive: true })
        const canConsumeHorizontalPan = (target, dx) => {
          let node = target instanceof Element ? target : null
          while (node && node !== document.body) {
            const style = window.getComputedStyle(node)
            const horizontal = style.overflowX === 'auto' || style.overflowX === 'scroll'
            if (horizontal && node.scrollWidth > node.clientWidth + 1) {
              const max = node.scrollWidth - node.clientWidth
              if (dx > 0 && node.scrollLeft > 0) return true
              if (dx < 0 && node.scrollLeft < max - 1) return true
            }
            node = node.parentElement
          }
          return false
        }
        const onTouchStart = (event) => {
          if (event.touches.length !== 1) return
          touchStartX = event.touches[0].clientX
          touchStartY = event.touches[0].clientY
          touchTarget = event.target
          const target = event.target instanceof Element ? event.target : null
          touchStartedInEditor = target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [data-composer-card]') !== null
        }
        const onTouchMove = (event) => {
          if (event.touches.length !== 1) return
          if (touchStartedInEditor || isEditing() || keyboardLikelyOpen()) return
          const dx = event.touches[0].clientX - touchStartX
          const dy = event.touches[0].clientY - touchStartY
          if (Math.abs(dx) < 7 || Math.abs(dx) <= Math.abs(dy)) return
          if (canConsumeHorizontalPan(touchTarget, dx)) return
          event.preventDefault()
        }
        document.addEventListener('touchstart', onTouchStart, { passive: true })
        document.addEventListener('touchmove', onTouchMove, { passive: false })
        ctx.effect(() => () => {
          document.removeEventListener('touchstart', onTouchStart)
          document.removeEventListener('touchmove', onTouchMove)
          window.visualViewport?.removeEventListener('resize', syncKeyboardState)
          window.visualViewport?.removeEventListener('scroll', syncKeyboardState)
          window.removeEventListener('focusin', syncKeyboardState)
          window.removeEventListener('focusout', syncKeyboardState)
          document.documentElement.removeAttribute('data-dsh-keyboard-open')
        })
      }

      if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="dsh-mobile-ui"]')) {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-mobile-ui'
        style.dataset.pluginCss = 'dsh-mobile-ui'
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove())
      }

      const connection = ctx.get('connection')
      const api = connection.api

      const frame = () => document.querySelector('[data-shell-overlay]')?.parentElement ?? null

      if (typeof window !== 'undefined') {
        const media = window.matchMedia(`(max-width: ${BREAKPOINT}px)`)
        let initialized = false

        const syncMobileFrame = () => {
          const root = frame()
          if (!root) return false

          if (media.matches) {
            root.setAttribute('data-dsh-mobile-frame', '')
          } else {
            root.removeAttribute('data-dsh-mobile-frame')
            root.removeAttribute('data-mobile-drawer-open')
          }

          initialized = true
          return true
        }

        if (!syncMobileFrame()) {
          const observer = new MutationObserver(() => {
            if (syncMobileFrame()) observer.disconnect()
          })
          observer.observe(document.documentElement, { childList: true, subtree: true })
          ctx.effect(() => () => observer.disconnect())
        }

        const onMediaChange = () => {
          initialized = false
          syncMobileFrame()
        }
        media.addEventListener?.('change', onMediaChange)
        ctx.effect(() => () => media.removeEventListener?.('change', onMediaChange))
      }

      // ===== Chrome root: top bar + backdrop + drawer + hero brand =====
      if (typeof document !== 'undefined') {
        const chrome = document.createElement('div')
        chrome.className = 'dsh-mobile-root-chrome'
        chrome.innerHTML = `
          <button type="button" class="dsh-mobile-backdrop" aria-label="关闭会话栏"></button>
          <div class="dsh-mobile-topbar">
            <button type="button" class="dsh-mobile-icon-button" data-mobile-menu aria-label="打开会话栏">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
            </button>
            <div class="dsh-mobile-topbar-title" data-mobile-title></div>
            <button type="button" class="dsh-mobile-icon-button" data-mobile-new aria-label="新建会话">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
            </button>
          </div>`
        document.body.appendChild(chrome)

        const title = chrome.querySelector('[data-mobile-title]')
        const setDrawerOpen = (open) => {
          const root = frame()
          if (!root) return
          if (open) {
            chrome.setAttribute('data-open', '')
            root.setAttribute('data-mobile-drawer-open', '')
          } else {
            chrome.removeAttribute('data-open')
            root.removeAttribute('data-mobile-drawer-open')
          }
        }
        const closeDrawer = () => setDrawerOpen(false)
        const updateTitle = () => {
          if (!(title instanceof HTMLElement)) return
          const state = ctx.sessions.list.getSnapshot()
          const id = state.current
          const summary = id === undefined ? undefined : state.byId[id]
          title.textContent = summary?.blank ? '新对话' : (summary?.displayTitle ?? 'DSH')
        }
        updateTitle()
        const unsubscribe = ctx.sessions.list.subscribe(updateTitle)
        chrome.querySelector('[data-mobile-menu]')?.addEventListener('click', () => setDrawerOpen(true))
        chrome.querySelector('.dsh-mobile-backdrop')?.addEventListener('click', closeDrawer)
        chrome.querySelector('[data-mobile-new]')?.addEventListener('click', () => {
          closeDrawer()
          ctx.workspaces.startSession()
        })

        // Settings: delegate to the parked desktop sidebar's trigger button.
        // Its click handler is React-bound, so it fires even while the
        // sidebar itself is clipped to zero width; the Settings overlay is
        // fixed-positioned against the viewport and appears normally.
        const openSettings = () => {
          const trigger = document.querySelector('[data-slot="sidebar.settings"] button')
          if (trigger instanceof HTMLElement) trigger.click()
        }

        // ===== Drawer (pure DOM, no react-dom dependency) =====
        const drawer = document.createElement('div')
        drawer.className = 'dsh-mobile-drawer'
        drawer.innerHTML = `
          <div class="dsh-mobile-drawer-head">
            <div class="dsh-mobile-drawer-brand">
              <strong>DSH</strong><span>Harness</span>
            </div>
            <button type="button" class="dsh-mobile-icon-button" data-drawer-close aria-label="关闭会话栏">${svgClose()}</button>
          </div>
          <button type="button" class="dsh-mobile-new-session" data-drawer-new>${svgPlus()}<span>新建会话</span></button>
          <div class="dsh-mobile-drawer-tools">
            <input type="text" class="dsh-mobile-drawer-search" data-drawer-search placeholder="搜索会话..." aria-label="搜索会话" autocomplete="off" />
            <button type="button" class="dsh-mobile-drawer-refresh" data-drawer-refresh aria-label="刷新会话列表">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 10-2.34 5.66M20 12V8m0 0h-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="dsh-mobile-drawer-section">最近会话</div>
          <div class="dsh-mobile-drawer-list" data-drawer-list></div>
          <div class="dsh-mobile-drawer-foot">
            <button type="button" class="dsh-mobile-drawer-settings" data-drawer-settings>${svgGear()}<span>设置</span></button>
          </div>`
        document.body.appendChild(drawer)

        const listEl = drawer.querySelector('[data-drawer-list]')
        const searchEl = drawer.querySelector('[data-drawer-search]')
        const refreshEl = drawer.querySelector('[data-drawer-refresh]')
        let searchQuery = ''

        const normalize = (value) => (value || '').toLowerCase().trim()
        const matchesQuery = (row) => {
          if (!searchQuery) return true
          const title = normalize(sessionTitle(row.summary))
          const display = normalize(row.summary?.displayTitle)
          const plain = normalize(row.summary?.title)
          return title.includes(searchQuery) || display.includes(searchQuery) || plain.includes(searchQuery)
        }

        const renderList = () => {
          if (!(listEl instanceof HTMLElement)) return
          const snap = ctx.sessions.list.getSnapshot()
          const byId = snap.byId || {}
          const current = snap.current
          const rows = (snap.ids || [])
            .map((id) => ({ id, summary: byId[id] }))
            .filter((row) => row.summary !== undefined && matchesQuery(row))
            .sort((a, b) => {
              const ta = a.summary.updatedAt ?? 0
              const tb = b.summary.updatedAt ?? 0
              return tb - ta
            })

          if (rows.length === 0) {
            listEl.innerHTML = searchQuery
              ? '<div class="dsh-mobile-session-empty">没有匹配的会话</div>'
              : '<div class="dsh-mobile-session-empty">暂无会话，点上方按钮开始第一个对话</div>'
            return
          }

          const fragment = document.createDocumentFragment()
          for (const row of rows) {
            const item = document.createElement('button')
            item.type = 'button'
            item.className = 'dsh-mobile-session-item'
            item.setAttribute('data-session-id', row.id)
            if (row.id === current) item.setAttribute('data-current', '')
            item.innerHTML = `
              <div class="dsh-mobile-session-item-text">
                <div class="dsh-mobile-session-item-title"></div>
                <div class="dsh-mobile-session-item-time"></div>
              </div>`
            item.querySelector('.dsh-mobile-session-item-title').textContent = sessionTitle(row.summary)
            item.querySelector('.dsh-mobile-session-item-time').textContent = timeAgo(row.summary.updatedAt)
            item.addEventListener('click', () => {
              closeDrawer()
              ctx.sessions.open(row.id)
            })
            fragment.appendChild(item)
          }
          listEl.replaceChildren(fragment)
        }
        renderList()
        const unsubscribeList = ctx.sessions.list.subscribe(renderList)

        drawer.querySelector('[data-drawer-close]')?.addEventListener('click', closeDrawer)
        drawer.querySelector('[data-drawer-new]')?.addEventListener('click', () => {
          closeDrawer()
          ctx.workspaces.startSession()
        })
        drawer.querySelector('[data-drawer-settings]')?.addEventListener('click', () => {
          closeDrawer()
          setTimeout(openSettings, 260)
        })

        // Search filters the session list locally as you type.
        searchEl?.addEventListener('input', () => {
          searchQuery = normalize(searchEl instanceof HTMLInputElement ? searchEl.value : '')
          renderList()
        })

        // Refresh pulls the authoritative session baseline from the host
        // (single-flight; the icon spins while the request is in flight).
        refreshEl?.addEventListener('click', async () => {
          if (refreshEl.hasAttribute('data-busy')) return
          refreshEl.setAttribute('data-busy', '')
          try {
            await ctx.sessions.refresh()
          } catch (cause) {
            // The baseline stays as-is; the store surfaces errors internally.
          } finally {
            refreshEl.removeAttribute('data-busy')
          }
        })

        const syncDrawerOpen = () => {
          drawer.toggleAttribute('data-open', chrome.hasAttribute('data-open'))
        }
        const openObserver = new MutationObserver(syncDrawerOpen)
        openObserver.observe(chrome, { attributes: true, attributeFilter: ['data-open'] })
        syncDrawerOpen()

        // Escape closes the drawer.
        const onKey = (event) => {
          if (event.key === 'Escape' && chrome.hasAttribute('data-open')) closeDrawer()
        }
        window.addEventListener('keydown', onKey)

        // ===== Hero brand (pure DOM) =====
        const heroBrand = document.createElement('div')
        heroBrand.className = 'dsh-mobile-hero-brand'
        heroBrand.innerHTML = `
          <div class="dsh-mobile-hero-logo">DSH</div>
          <h1 class="dsh-mobile-hero-title">开始探索</h1>
          <p class="dsh-mobile-hero-sub">选择下方的 Agent 预设，或直接输入你的需求。</p>`
        const installHeroBrand = () => {
          const scroll = document.querySelector('[data-phase="hero"] [data-conversation-scroll]')
          if (!scroll || scroll.contains(heroBrand)) return
          scroll.prepend(heroBrand)
        }
        const heroObserver = new MutationObserver(installHeroBrand)
        heroObserver.observe(document.documentElement, { childList: true, subtree: true })
        installHeroBrand()

        // ===== Settings overlay: top bar must hide while it's open =====
        // NOTE: do NOT re-parent .VOzbGW_overlay to body — React unmounts it
        // from its original host container; moving it breaks removeChild
        // ("slot entry crashed in 'sidebar.settings'") and freezes all
        // dropdowns inside the panel.
        //
        // The overlay lives inside the desktop sidebar React tree. On a real
        // device the sidebar root may hold an identity transform after dsh's
        // collapse animation — ANY non-none transform (even identity) creates
        // a containing block that captures position:fixed and shrinks the
        // overlay to the 20px sidebar box ("settings embedded in chat").
        // Instead of moving the node, we strip containing-block creators
        // from its ancestors for as long as the overlay is mounted, and
        // restore them when it unmounts. React unmounts stay untouched.
        const savedContaining = []
        const savedLifted = []
        const resetContainingBlocks = (overlay) => {
          let node = overlay.parentElement
          while (node && node !== document.documentElement) {
            const cs = getComputedStyle(node)
            const checks = [
              ['transform', cs.transform !== 'none'],
              ['filter', cs.filter !== 'none'],
              ['perspective', cs.perspective !== 'none'],
              ['contain', cs.contain && cs.contain !== 'none'],
            ]
            for (const [prop, isBlocking] of checks) {
              if (isBlocking && node.__dshMobileContainFixed === undefined) {
                node.__dshMobileContainFixed = node.style.getPropertyValue(prop)
                node.style.setProperty(prop, 'none', 'important')
                savedContaining.push({ node, prop })
              }
            }
            node = node.parentElement
          }
        }
        const restoreContainingBlocks = () => {
          while (savedContaining.length) {
            const { node, prop } = savedContaining.pop()
            if (node.__dshMobileContainFixed === '') node.style.removeProperty(prop)
            else node.style.setProperty(prop, node.__dshMobileContainFixed)
            delete node.__dshMobileContainFixed
          }
        }
        // The overlay is trapped inside the sidebar column, whose z-index:1
        // ties with the composer stack (also z:1, later in DOM order) — so
        // the composer paints over the full-screen Settings panel. Lift the
        // first fixed-position ancestor (the sidebar column) above every
        // other stacking context while the overlay is mounted.
        const liftSidebarStack = (overlay) => {
          let node = overlay.parentElement
          while (node && node !== document.documentElement) {
            if (getComputedStyle(node).position === 'fixed' && node.__dshMobileLifted === undefined) {
              node.__dshMobileLifted = node.style.getPropertyValue('z-index')
              node.style.setProperty('z-index', '9000', 'important')
              savedLifted.push(node)
            }
            node = node.parentElement
          }
        }
        const restoreSidebarStack = () => {
          while (savedLifted.length) {
            const node = savedLifted.pop()
            if (node.__dshMobileLifted === '') node.style.removeProperty('z-index')
            else node.style.setProperty('z-index', node.__dshMobileLifted)
            delete node.__dshMobileLifted
          }
        }
        const settingsObserver = new MutationObserver(() => {
          const overlay = document.querySelector('.VOzbGW_overlay')
          const open = overlay !== null
          document.body.toggleAttribute('data-dsh-mobile-settings-open', open)
          if (open) {
            resetContainingBlocks(overlay)
            liftSidebarStack(overlay)
          } else {
            restoreContainingBlocks()
            restoreSidebarStack()
          }
        })
        settingsObserver.observe(document.body, { childList: true, subtree: true })
        document.body.toggleAttribute('data-dsh-mobile-settings-open',
          document.querySelector('.VOzbGW_overlay') !== null)
        if (document.querySelector('.VOzbGW_overlay')) {
          const existing = document.querySelector('.VOzbGW_overlay')
          resetContainingBlocks(existing)
          liftSidebarStack(existing)
        }

        ctx.effect(() => () => {
          unsubscribe()
          unsubscribeList()
          openObserver.disconnect()
          heroObserver.disconnect()
          settingsObserver.disconnect()
          document.body.removeAttribute('data-dsh-mobile-settings-open')
          window.removeEventListener('keydown', onKey)
          chrome.remove()
          drawer.remove()
        })
      }

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'mobile-agent-presets',
        order: -100,
        inject: (sessionId) => ({
          loadPresets: async () => {
            const response = await api.agentPresets.list({})
            if (!response.result.ok) throw new Error(response.result.error.message)
            return response.result.value.presets
              .filter((preset) => preset.broken === undefined)
              .map((preset) => preset.id)
          },
          selectPreset: async (agentPreset) => {
            const response = await api.agentPresets.select({ sessionId, agentPreset })
            if (!response.result.ok) throw new Error(response.result.error.message)
            const applied = response.result.value.agentPreset
            ctx.sessions.noteAgentPreset(sessionId, applied)
            return applied
          },
        }),
      }, QuickPresetDock))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
