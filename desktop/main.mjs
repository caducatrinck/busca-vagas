import { app, BrowserWindow, Menu, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const API_HOST = '127.0.0.1'
const API_PORT = Number(process.env.BUSCA_VAGAS_PORT || 8787)

/** @type {import('node:child_process').ChildProcess | null} */
let apiProcess = null
/** @type {BrowserWindow | null} */
let mainWindow = null

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

  const dataDir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    API_HOST,
    API_PORT: String(API_PORT),
    BUSCA_VAGAS_DATA_DIR: dataDir,
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
    console.error(`[api] saiu code=${code} signal=${signal}`)
    apiProcess = null
  })
}

async function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'Busca Vagas',
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const url = `http://${API_HOST}:${API_PORT}/`
  await mainWindow.loadURL(url)

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

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    try {
      startApi()
      await waitForHealth(`http://${API_HOST}:${API_PORT}/health`)
      await createWindow()
    } catch (err) {
      console.error(err)
      stopApi()
      app.quit()
    }
  })

  app.on('before-quit', () => {
    stopApi()
  })

  app.on('window-all-closed', () => {
    stopApi()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(console.error)
    }
  })
}
