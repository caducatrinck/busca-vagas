import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  shell,
} from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withTrayBadge } from './trayBadge.mjs'
import { registerUpdater, scheduleUpdateCheck } from './updater.mjs'
import { registerLinkedInLogin } from './linkedinLogin.mjs'
import {
  ensureAppDirs,
  migrateLegacyLogsLayout,
  resolveDataDir,
  resolveLogsDir,
} from './appPaths.mjs'
import {
  installElectronCrashHooks,
  logElectron,
  logElectronStartup,
} from './electronLog.mjs'

installElectronCrashHooks()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_HOST = '127.0.0.1'
const API_PORT = Number(process.env.BUSCA_VAGAS_PORT || 8787)
const APP_DISPLAY_NAME = 'Busca Vagas'

function desktopLocale() {
  const raw = (app.getLocale?.() || '').toLowerCase()
  return raw.startsWith('pt') ? 'pt' : 'en'
}

function d(pt, en) {
  return desktopLocale() === 'pt' ? pt : en
}

function ensureWindowsNotificationIdentity() {
  if (process.platform !== 'win32') return
  app.setName(APP_DISPLAY_NAME)
  app.setAppUserModelId(APP_DISPLAY_NAME)
}

function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

let apiProcess = null

let mainWindow = null

let splashWindow = null

let tray = null
let mainUiReady = false
let isQuitting = false
let trayBadgeCount = 0

function resourcesRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app-resources')
  }
  return path.join(__dirname, 'resources')
}

function serverEntry() {
  return path.join(resourcesRoot(), 'server.cjs')
}

function staticDir() {
  return path.join(resourcesRoot(), 'web')
}

function iconPath() {
  const p = path.join(__dirname, 'build', 'icon.png')
  return fs.existsSync(p) ? p : undefined
}

function trayImage() {
  const p = iconPath()
  if (!p) return nativeImage.createEmpty()
  const img = nativeImage.createFromPath(p)
  if (img.isEmpty()) return img
  return withTrayBadge(img, trayBadgeCount)
}

function applyTrayBadge(count) {
  trayBadgeCount = Math.max(0, Math.floor(Number(count) || 0))
  if (!tray) return
  tray.setImage(trayImage())
  tray.setToolTip(
    trayBadgeCount > 0
      ? d(
          `Busca Vagas — ${trayBadgeCount} nova(s)`,
          `Busca Vagas — ${trayBadgeCount} new`,
        )
      : APP_DISPLAY_NAME,
  )
}

function waitForHealth(url, timeoutMs = 45_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
          return
        }
        retry()
      })
      req.on('error', retry)
      req.setTimeout(2000, () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`API não respondeu a tempo (${url})`))
        return
      }
      setTimeout(tick, 250)
    }
    tick()
  })
}

function setSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return
  const safe = JSON.stringify(String(text))
  void splashWindow.webContents
    .executeJavaScript(`window.setStatus && window.setStatus(${safe})`)
    .catch(() => {})
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.hide()
  if (process.platform !== 'win32' || !Notification.isSupported()) return
  const icon = iconPath()
  const n = new Notification({
    title: APP_DISPLAY_NAME,
    body: d(
      'Continua rodando na bandeja. Clique no ícone para abrir.',
      'Still running in the tray. Click the icon to open.',
    ),
    ...(icon ? { icon } : {}),
  })
  n.on('click', () => showMainWindow())
  n.show()
}

function destroyTray() {
  if (!tray) return
  tray.destroy()
  tray = null
}

function createTray() {
  if (tray) return
  tray = new Tray(trayImage())
  tray.setToolTip(
    trayBadgeCount > 0
      ? d(
          `Busca Vagas — ${trayBadgeCount} nova(s)`,
          `Busca Vagas — ${trayBadgeCount} new`,
        )
      : APP_DISPLAY_NAME,
  )
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: d('Abrir Busca Vagas', 'Open Busca Vagas'),
        click: () => showMainWindow(),
      },
      { type: 'separator' },
      {
        label: d('Sair', 'Quit'),
        click: () => {
          logElectron('INFO', 'tray.quit_clicked')
          isQuitting = true
          destroyTray()
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
}

async function createSplash() {
  const icon = iconPath()
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    show: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Busca Vagas',
    ...(icon ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  splashWindow.once('ready-to-show', () => splashWindow?.show())
  await splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  setSplashStatus(d('Iniciando…', 'Starting…'))
}

function closeSplash() {
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null
    return
  }
  splashWindow.close()
  splashWindow = null
}

function startApi() {
  const entry = serverEntry()
  const webDir = staticDir()
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Servidor não encontrado em ${entry}. Rode: npm run desktop:prepare`,
    )
  }
  if (!fs.existsSync(path.join(webDir, 'index.html'))) {
    throw new Error(
      `UI não encontrada em ${webDir}. Rode: npm run desktop:prepare`,
    )
  }

  const { dataDir, logsDir } = ensureAppDirs()
  process.env.BUSCA_VAGAS_DATA_DIR = dataDir
  process.env.BUSCA_VAGAS_LOGS_DIR = logsDir

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    API_HOST,
    API_PORT: String(API_PORT),
    BUSCA_VAGAS_DATA_DIR: dataDir,
    BUSCA_VAGAS_LOGS_DIR: logsDir,
    BUSCA_VAGAS_STATIC_DIR: webDir,
    CORS_ORIGINS: `http://${API_HOST}:${API_PORT},http://localhost:${API_PORT}`,
  }

  apiProcess = spawn(process.execPath, [entry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  apiProcess.stdout?.on('data', (buf) => {
    process.stdout.write(`[api] ${buf}`)
  })
  apiProcess.stderr?.on('data', (buf) => {
    process.stderr.write(`[api] ${buf}`)
  })
  apiProcess.on('exit', (code, signal) => {
    logElectron(
      isQuitting ? 'INFO' : 'ERROR',
      'api.exit',
      { code, signal, isQuitting },
    )
    console.error(`[api] saiu code=${code} signal=${signal}`)
    apiProcess = null
  })
}

async function createWindow() {
  const icon = iconPath()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Busca Vagas',
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`http://${API_HOST}:${API_PORT}/`)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })


  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideToTray()
  })


  mainWindow.on('minimize', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideToTray()
  })

  const url = `http://${API_HOST}:${API_PORT}/`
  await new Promise((resolve, reject) => {
    if (!mainWindow) {
      reject(new Error('Janela principal indisponível'))
      return
    }
    const onFail = (_e, _code, desc) => {
      cleanup()
      reject(new Error(desc || 'Falha ao carregar a interface'))
    }
    const onDone = () => {
      cleanup()
      resolve()
    }
    const cleanup = () => {
      mainWindow?.webContents.off('did-fail-load', onFail)
      mainWindow?.webContents.off('did-finish-load', onDone)
    }
    mainWindow.webContents.once('did-fail-load', onFail)
    mainWindow.webContents.once('did-finish-load', onDone)
    mainWindow.loadURL(url).catch((err) => {
      cleanup()
      reject(err)
    })
  })

  mainUiReady = true
  createTray()
  mainWindow.show()
  mainWindow.focus()
  closeSplash()
  scheduleUpdateCheck(() => mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function stopApi() {
  if (!apiProcess || apiProcess.killed) return
  apiProcess.kill('SIGTERM')
  setTimeout(() => {
    if (apiProcess && !apiProcess.killed) apiProcess.kill('SIGKILL')
  }, 2000)
}

ensureWindowsNotificationIdentity()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  logElectron('WARN', 'second-instance.lock_denied — quitting')
  app.quit()
} else {
  logElectronStartup()
  app.on('second-instance', () => {
    logElectron('INFO', 'second-instance.focus')
    if (splashWindow && !splashWindow.isDestroyed() && !mainUiReady) {
      splashWindow.focus()
      return
    }
    showMainWindow()
  })

  app.whenReady().then(async () => {
    logElectron('INFO', 'app.whenReady')
    const dirs = ensureAppDirs()
    process.env.BUSCA_VAGAS_DATA_DIR = dirs.dataDir
    process.env.BUSCA_VAGAS_LOGS_DIR = dirs.logsDir
    const migrated = migrateLegacyLogsLayout()
    if (migrated.migrated) {
      logElectron('INFO', 'logs.migrated', migrated)
    }
    logElectron('INFO', 'app.paths', dirs)
    ensureWindowsNotificationIdentity()
    Menu.setApplicationMenu(null)
    registerUpdater(() => mainWindow)
    registerLinkedInLogin(() => mainWindow)
    ipcMain.on('tray:setBadge', (_event, count) => {
      applyTrayBadge(count)
    })
    try {
      await createSplash()
      setSplashStatus(d('Subindo o servidor local…', 'Starting local server…'))
      startApi()
      logElectron('INFO', 'api.spawned', {
        entry: serverEntry(),
        staticDir: staticDir(),
        dataDir: resolveDataDir(),
        logsDir: resolveLogsDir(),
      })
      setSplashStatus(d('Aguardando API…', 'Waiting for API…'))
      await waitForHealth(`http://${API_HOST}:${API_PORT}/health`)
      setSplashStatus(d('Carregando interface…', 'Loading interface…'))
      await createWindow()
      logElectron('INFO', 'ui.ready')
    } catch (err) {
      logElectron('ERROR', 'startup.failed', err)
      console.error(err)
      setSplashStatus(d('Falha ao iniciar. Fechando…', 'Failed to start. Closing…'))
      await new Promise((r) => setTimeout(r, 1200))
      closeSplash()
      destroyTray()
      stopApi()
      app.quit()
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
    destroyTray()
    stopApi()
  })

  app.on('window-all-closed', () => {

    if (!isQuitting) return
    if (!mainUiReady) return
    stopApi()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(console.error)
    } else {
      showMainWindow()
    }
  })
}
