import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

import type { DesktopProfileRoute } from './desktop-profile'
import type { HudModifierApi, HudModifierStatus } from './hud-modifier-types'
import { customWindowControlsEnabled } from './window-controls'

// Which translucency the OS can back. Asked synchrocandlecodely because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.jinDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('jin:translucency:support')
const hudWindowing = ipcRenderer.sendSync('jin:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true

const launchFlags: { localModels?: boolean; guestOnboarding?: boolean; skipIntro?: boolean } | undefined =
  ipcRenderer.sendSync('jin:feature-flags')

// Local, sanitized skin payload for the first renderer theme paint. This does
// not wait on `gateway.ready`, so an unreachable remote primary cannot force
// the built-in palette over the skin configured on this machine.
const localSkin = ipcRenderer.sendSync('jin:skin:local')

contextBridge.exposeInMainWorld('jinDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Launch-flag fact: the CandleCode free tier is on for this launch
  // (JIN_GUEST_ONBOARDING=1 or --guest-onboarding). Read-only; the same
  // decision is stamped onto every backend the app spawns.
  guestOnboardingEnabled: launchFlags?.guestOnboarding === true,
  localSkin: localSkin && typeof localSkin === 'object' ? localSkin : null,
  // Launch-flag fact: skip the first-run film (JIN_SKIP_INTRO=1 or
  // --skip-intro). Rehearsal aid for the guided chat behind it.
  skipIntro: launchFlags?.skipIntro === true,
  getConnection: (profile, opts) => ipcRenderer.invoke('jin:connection', profile, opts),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('jin:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('jin:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('jin:connection:revalidate'),
  touchBackend: (profile, options) => ipcRenderer.invoke('jin:backend:touch', profile, options),
  getPoolLimits: () => ipcRenderer.invoke('jin:pool-limits:get'),
  setPoolLimits: limits => ipcRenderer.invoke('jin:pool-limits:set', limits),
  getGatewayWsUrl: profile => ipcRenderer.invoke('jin:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('jin:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('jin:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('jin:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('jin:window:openInTerminal', sessionId, opts),
  openWindow: (options?: DesktopProfileRoute) => ipcRenderer.invoke('jin:window:openInstance', options),
  openBrowserWindow: tabId => ipcRenderer.invoke('jin:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('jin:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('jin:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('jin:ambient:claim', key),
  windowControls: {
    custom: customWindowControlsEnabled(),
    minimize: () => ipcRenderer.send('jin:window-control', 'minimize'),
    toggleMaximize: () => ipcRenderer.send('jin:window-control', 'toggle-maximize'),
    close: () => ipcRenderer.send('jin:window-control', 'close')
  },
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('jin:wake-indicator:get'),
    setState: state => ipcRenderer.send('jin:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('jin:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('jin:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    grow: request => ipcRenderer.send('jin:chat-onboarding:grow', request),
    soloBoot: () => ipcRenderer.send('jin:chat-onboarding:solo-boot')
  },
  introReveal: {
    open: (payload?: { hideMain?: boolean }) => ipcRenderer.invoke('jin:intro-reveal:open', payload),
    close: (payload?: { showMain?: boolean }) => ipcRenderer.invoke('jin:intro-reveal:close', payload),
    skip: () => ipcRenderer.send('jin:intro-reveal:skip'),
    ready: () => ipcRenderer.send('jin:intro-reveal:ready'),
    onSkip: callback => {
      const listener = () => callback()

      ipcRenderer.on('jin:intro-reveal:skip', listener)

      return () => ipcRenderer.removeListener('jin:intro-reveal:skip', listener)
    },
    onClosed: callback => {
      const listener = () => callback()

      ipcRenderer.on('jin:intro-reveal:closed', listener)

      return () => ipcRenderer.removeListener('jin:intro-reveal:closed', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('jin:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('jin:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('jin:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('jin:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('jin:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('jin:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('jin:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('jin:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('jin:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('jin:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('jin:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('jin:hud:open', request),
    close: () => ipcRenderer.invoke('jin:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('jin:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('jin:hud:begin-move'),
    endMove: () => ipcRenderer.send('jin:hud:end-move'),
    moveBy: delta => ipcRenderer.send('jin:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('jin:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('jin:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('jin:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('jin:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('jin:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('jin:hud:goto', listener)

      return () => ipcRenderer.removeListener('jin:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('jin:hud:changed', listener)

      return () => ipcRenderer.removeListener('jin:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('jin:hud:cursor', listener)

      return () => ipcRenderer.removeListener('jin:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('jin:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('jin:hud:game-overlay', listener)
    }
  },
  hudModifier: {
    getSettings: () => ipcRenderer.invoke('jin:hud-modifier:settings:get'),
    setEnabled: enabled => ipcRenderer.invoke('jin:hud-modifier:settings:set', enabled),
    openPermissionSettings: () => ipcRenderer.invoke('jin:hud-modifier:permission'),
    onStatus: callback => {
      const listener = (_event: Electron.IpcRendererEvent, status: HudModifierStatus) => callback(status)
      ipcRenderer.on('jin:hud-modifier:status', listener)

      return () => ipcRenderer.removeListener('jin:hud-modifier:status', listener)
    }
  } satisfies HudModifierApi,
  // macOS native screenshot gesture; captures require a main-issued request.
  screenshot:
    process.platform === 'darwin'
      ? {
          getSettings: () => ipcRenderer.invoke('jin:screenshot:settings:get'),
          setEnabled: enabled => ipcRenderer.invoke('jin:screenshot:settings:set', enabled),
          openPermissionSettings: kind => ipcRenderer.invoke('jin:screenshot:permission', kind),
          capture: requestId => ipcRenderer.invoke('jin:screenshot:capture', requestId),
          onStatus: callback => {
            const listener = (_event, status) => callback(status)
            ipcRenderer.on('jin:screenshot:status', listener)

            return () => ipcRenderer.removeListener('jin:screenshot:status', listener)
          },
          onRequest: callback => {
            const channel = 'jin:screenshot:request'
            const listener = (_event, requestId) => callback(requestId)

            if (ipcRenderer.listenerCount(channel) === 0) {
              ipcRenderer.send('jin:screenshot:subscribe', true)
            }

            ipcRenderer.on(channel, listener)

            return () => {
              ipcRenderer.removeListener(channel, listener)

              if (ipcRenderer.listenerCount(channel) === 0) {
                ipcRenderer.send('jin:screenshot:subscribe', false)
              }
            }
          }
        }
      : undefined,
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('jin:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('jin:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('jin:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('jin:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('jin:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('jin:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('jin:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('jin:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('jin:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('jin:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('jin:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('jin:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('jin:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('jin:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('jin:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('jin:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('jin:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('jin:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('jin:connections:list'),
    save: payload => ipcRenderer.invoke('jin:connections:save', payload),
    remove: id => ipcRenderer.invoke('jin:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('jin:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('jin:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('jin:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('jin:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('jin:connections:update-managed', id),
    // Fan out `jin update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('jin:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('jin:connections:changed', listener)

      return () => ipcRenderer.removeListener('jin:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('jin:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('jin:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('jin:connection-config:probe', remoteUrl),
  // `options` lets a registry-editor draft sign in BEFORE it is saved: the
  // main process settles the draft's connection id up front so the login
  // window writes into the per-connection cookie jar the saved entry will
  // read (not the legacy shared jar an unsaved URL would fall back to).
  oauthLoginConnectionConfig: (remoteUrl, options) =>
    ipcRenderer.invoke('jin:connection-config:oauth-login', remoteUrl, options),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('jin:connection-config:oauth-logout', remoteUrl),
  // Jin Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('jin:cloud:status'),
    login: () => ipcRenderer.invoke('jin:cloud:login'),
    logout: () => ipcRenderer.invoke('jin:cloud:logout'),
    discover: org => ipcRenderer.invoke('jin:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('jin:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    getDefault: () => ipcRenderer.invoke('jin:profile:default:get'),
    setDefault: (route: DesktopProfileRoute) => ipcRenderer.invoke('jin:profile:default:set', route),
    onDefaultChanged: (callback: (route: DesktopProfileRoute | null) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, route: DesktopProfileRoute | null) => callback(route)
      ipcRenderer.on('jin:profile:default:changed', listener)

      return () => ipcRenderer.removeListener('jin:profile:default:changed', listener)
    },
    get: () => ipcRenderer.invoke('jin:profile:get'),
    remember: name => ipcRenderer.invoke('jin:profile:remember', name),
    set: name => ipcRenderer.invoke('jin:profile:set', name)
  },
  api: request => ipcRenderer.invoke('jin:api', request),
  notify: payload => ipcRenderer.invoke('jin:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('jin:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('jin:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('jin:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('jin:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('jin:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('jin:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('jin:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('jin:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('jin:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('jin:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('jin:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('jin:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('jin:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('jin:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('jin:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('jin:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('jin:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('jin:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('jin:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('jin:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('jin:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('jin:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('jin:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('jin:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('jin:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('jin:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('jin:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('jin:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('jin:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('jin:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('jin:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('jin:keep-awake', on),
  minimizeToTray: {
    get: () => ipcRenderer.invoke('jin:minimize-to-tray:get'),
    set: on => ipcRenderer.invoke('jin:minimize-to-tray:set', on),
    onChanged: callback => {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('jin:minimize-to-tray:changed', listener)

      return () => ipcRenderer.removeListener('jin:minimize-to-tray:changed', listener)
    }
  },
  setDisableF12: blocked => ipcRenderer.send('jin:devtools:disable-f12', blocked),
  setF12ShortcutActive: active => ipcRenderer.send('jin:f12ShortcutActive', Boolean(active)),
  onF12Shortcut: callback => {
    const listener = (_event, input) => callback(input)
    ipcRenderer.on('jin:f12-shortcut', listener)

    return () => ipcRenderer.removeListener('jin:f12-shortcut', listener)
  },
  setPreviewShortcutActive: active => ipcRenderer.send('jin:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('jin:openExternal', url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('jin:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('jin:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('jin:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('jin:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('jin:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('jin:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('jin:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('jin:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('jin:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('jin:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('jin:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('jin:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('jin:zoom:get'),
    // Synchrocandlecode zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('jin:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('jin:zoom:changed', listener)

      return () => ipcRenderer.removeListener('jin:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('jin:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('jin:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('jin:logs:renderer-error', report),
  logLine: (line: string): void => ipcRenderer.send('jin:logs:renderer-line', line),
  readDir: dirPath => ipcRenderer.invoke('jin:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('jin:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('jin:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('jin:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('jin:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: () => ipcRenderer.invoke('jin:fs:reconcileDesktopPlugins'),
  logsRoot: () => ipcRenderer.invoke('jin:fs:logsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('jin:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('jin:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('jin:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('jin:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('jin:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('jin:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('jin:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('jin:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('jin:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('jin:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('jin:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('jin:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('jin:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('jin:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('jin:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('jin:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('jin:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('jin:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('jin:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('jin:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('jin:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('jin:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('jin:git:review:prList', repoPath, branches, numbers),
      createPr: repoPath => ipcRenderer.invoke('jin:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('jin:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('jin:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('jin:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('jin:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('jin:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('jin:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `jin:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `jin:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('jin:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('jin:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('jin:preview-nav', listener)

    return () => ipcRenderer.removeListener('jin:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('jin:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('jin:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('jin:open-updates', listener)

    return () => ipcRenderer.removeListener('jin:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:deep-link', listener)

    return () => ipcRenderer.removeListener('jin:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('jin:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('jin:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('jin:plugin:installDesktop', payload),
  removeDesktopPlugin: payload => ipcRenderer.invoke('jin:plugin:removeDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:window-state-changed', listener)

    return () => ipcRenderer.removeListener('jin:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('jin:focus-session', listener)

    return () => ipcRenderer.removeListener('jin:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:notification-action', listener)

    return () => ipcRenderer.removeListener('jin:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:notification-activate', listener)

    return () => ipcRenderer.removeListener('jin:notification-activate', listener)
  },
  onExternalOpenFailed: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:external-open-failed', listener)

    return () => ipcRenderer.removeListener('jin:external-open-failed', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('jin:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:backend-exit', listener)

    return () => ipcRenderer.removeListener('jin:backend-exit', listener)
  },
  // Cooperative pool retirement (main → renderer): the pooled backend under
  // `poolKey` is being stopped for a foreground open. Park that scope; do not
  // redial into the slot it vacated.
  onPoolBackendRetiring: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:pool:retiring', listener)

    return () => ipcRenderer.removeListener('jin:pool:retiring', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('jin:connection:applied', listener)

    return () => ipcRenderer.removeListener('jin:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('jin:power-resume', listener)

    return () => ipcRenderer.removeListener('jin:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('jin:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('jin:power-battery', listener)

    return () => ipcRenderer.removeListener('jin:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:boot-progress', listener)

    return () => ipcRenderer.removeListener('jin:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('jin:bootstrap:get'),
  probeLocalBackend: () => ipcRenderer.invoke('jin:local-backend:probe'),
  continueBootstrapLocal: () => ipcRenderer.invoke('jin:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('jin:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('jin:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('jin:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('jin:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('jin:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('jin:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('jin:version'),
  relaunchApp: () => ipcRenderer.invoke('jin:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('jin:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('jin:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('jin:uninstall:summary'),
    run: mode => ipcRenderer.invoke('jin:uninstall:run', { mode })
  },
  updates: {
    check: opts => ipcRenderer.invoke('jin:updates:check', opts),
    apply: opts => ipcRenderer.invoke('jin:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('jin:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('jin:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('jin:updates:progress', listener)

      return () => ipcRenderer.removeListener('jin:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('jin:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('jin:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('jin:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('jin:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('jin:found-in-page', listener)

    return () => ipcRenderer.removeListener('jin:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('jin:open-find-bar', listener)

    return () => ipcRenderer.removeListener('jin:open-find-bar', listener)
  }
})
