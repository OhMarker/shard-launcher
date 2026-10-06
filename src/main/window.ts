import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, screen, shell } from 'electron'
import { WINDOW_DEFAULT, WINDOW_MIN } from '@shared/constants'
import { type WindowState } from '@shared/types'
import { emit } from './ipc/router'
import { createLogger } from './logger'
import { type SettingsStore } from './store/settings'

const log = createLogger('window')

const BACKGROUND = '#07090f'

function clampToDisplays(state: WindowState): WindowState {
  const width = Math.max(WINDOW_MIN.width, state.width || WINDOW_DEFAULT.width)
  const height = Math.max(WINDOW_MIN.height, state.height || WINDOW_DEFAULT.height)
  if (state.x === null || state.y === null) return { ...state, width, height }
  const display = screen.getDisplayMatching({ x: state.x, y: state.y, width, height })
  const area = display.workArea
  const visible =
    state.x + width > area.x + 40 &&
    state.x < area.x + area.width - 40 &&
    state.y >= area.y - 10 &&
    state.y < area.y + area.height - 40
  if (!visible) return { ...state, width, height, x: null, y: null }
  return { ...state, width, height }
}

export function createMainWindow(settings: SettingsStore, isDev: boolean): BrowserWindow {
  const saved = clampToDisplays(settings.get().window)
  const preload = fileURLToPath(new URL('../preload/index.cjs', import.meta.url))

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x ?? undefined,
    y: saved.y ?? undefined,
    minWidth: WINDOW_MIN.width,
    minHeight: WINDOW_MIN.height,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 14 } : undefined,
    backgroundColor: BACKGROUND,
    autoHideMenuBar: true,
    title: 'Shard Launcher',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev
    }
  })

  win.setMenuBarVisibility(false)

  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize()
    win.show()
  })

  let saveTimer: NodeJS.Timeout | null = null
  const saveBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      const maximized = win.isMaximized()
      const bounds = maximized ? win.getNormalBounds() : win.getBounds()
      settings.update({
        window: { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, maximized }
      })
    }, 400)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  win.on('maximize', () => {
    emit('window:maximized', true)
    saveBounds()
  })
  win.on('unmaximize', () => {
    emit('window:maximized', false)
    saveBounds()
  })
  win.on('focus', () => emit('window:focus', true))
  win.on('blur', () => emit('window:focus', false))

  // Any window.open / target=_blank goes to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current && !url.startsWith('file://') && !url.startsWith(process.env.ELECTRON_RENDERER_URL ?? '\u0000')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(fileURLToPath(new URL('../renderer/index.html', import.meta.url))))
  }

  win.webContents.on('render-process-gone', (_e, details) => {
    log.error('Renderer process gone', details)
  })

  return win
}
