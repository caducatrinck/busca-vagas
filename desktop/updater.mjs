import { app, ipcMain, shell } from 'electron'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { GITHUB_REPO, resolveAvailableUpdate } from './updaterLogic.mjs'

export {
  GITHUB_REPO,
  LINUX_ASSET_SUFFIX,
  WIN_ASSET_SUFFIX,
  compareSemver,
  stripVersionTag,
} from './updaterLogic.mjs'

/** @typedef {'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'dismissed'} UpdaterPhase */

/** @type {{
 *   phase: UpdaterPhase,
 *   currentVersion: string,
 *   remoteVersion: string | null,
 *   assetName: string | null,
 *   downloadUrl: string | null,
 *   progress: number,
 *   downloadedPath: string | null,
 *   error: string | null,
 *   packaged: boolean,
 * }} */
let state = {
  phase: 'idle',
  currentVersion: '0.0.0',
  remoteVersion: null,
  assetName: null,
  downloadUrl: null,
  progress: 0,
  downloadedPath: null,
  error: null,
  packaged: false,
}

/** @type {(() => import('electron').BrowserWindow | null) | null} */
let getMainWindow = null

/** @type {import('node:http').ClientRequest | null} */
let activeRequest = null

function emit() {
  const win = getMainWindow?.()
  if (!win || win.isDestroyed()) return
  win.webContents.send('updater:state', { ...state })
}

function setState(patch) {
  state = { ...state, ...patch }
  emit()
}

function followGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error('Muitos redirects no download'))
      return
    }
    const mod = url.startsWith('http://') ? http : https
    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent': 'BuscaVagas-Updater',
          Accept: '*/*',
        },
      },
      (res) => {
        const code = res.statusCode ?? 0
        if (
          code >= 300 &&
          code < 400 &&
          res.headers.location &&
          typeof res.headers.location === 'string'
        ) {
          res.resume()
          const next = new URL(res.headers.location, url).toString()
          followGet(next, redirects + 1).then(resolve, reject)
          return
        }
        resolve({ req, res })
      },
    )
    req.on('error', reject)
  })
}

async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'BuscaVagas-Updater',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if ((res.statusCode ?? 0) === 404) {
            resolve(null)
            return
          }
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            reject(
              new Error(`err:update_github:${res.statusCode}`),
            )
            return
          }
          try {
            resolve(JSON.parse(text))
          } catch (err) {
            reject(err)
          }
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
  })
}

export async function checkForUpdate() {
  state.currentVersion = app.getVersion()
  state.packaged = app.isPackaged

  if (!app.isPackaged) {
    setState({
      phase: 'idle',
      remoteVersion: null,
      assetName: null,
      downloadUrl: null,
      progress: 0,
      downloadedPath: null,
      error: null,
    })
    return { ...state }
  }

  if (state.phase === 'downloading') return { ...state }

  setState({
    phase: 'checking',
    error: null,
    progress: 0,
    downloadedPath: null,
  })

  try {
    const release = await fetchLatestRelease()
    const decision = resolveAvailableUpdate({
      release,
      currentVersion: state.currentVersion,
      platform: process.platform,
    })

    if (!decision.available) {
      setState({
        phase: 'idle',
        remoteVersion: decision.remoteVersion,
        assetName: null,
        downloadUrl: null,
      })
      return { ...state }
    }

    setState({
      phase: 'available',
      remoteVersion: decision.remoteVersion,
      assetName: decision.assetName,
      downloadUrl: decision.downloadUrl,
      progress: 0,
      downloadedPath: null,
      error: null,
    })
    return { ...state }
  } catch (err) {
    setState({
      phase: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
    return { ...state }
  }
}

async function downloadUpdate() {
  if (state.phase === 'downloading') return { ...state }
  if (!state.downloadUrl || !state.assetName) {
    setState({ phase: 'error', error: 'err:update_no_asset' })
    return { ...state }
  }

  const downloadsDir = app.getPath('downloads')
  await fs.mkdir(downloadsDir, { recursive: true })
  const dest = path.join(downloadsDir, state.assetName)
  const partial = `${dest}.part`

  setState({
    phase: 'downloading',
    progress: 0,
    downloadedPath: null,
    error: null,
  })

  try {
    await fs.rm(partial, { force: true })
    const { req, res } = await followGet(state.downloadUrl)
    activeRequest = req

    const code = res.statusCode ?? 0
    if (code < 200 || code >= 300) {
      res.resume()
      throw new Error(`err:update_http:${code}`)
    }

    const total = Number(res.headers['content-length'] || 0)
    let received = 0
    const out = createWriteStream(partial)

    await new Promise((resolve, reject) => {
      res.on('data', (chunk) => {
        received += chunk.length
        if (total > 0) {
          const pct = Math.min(100, Math.round((received / total) * 100))
          if (pct !== state.progress) setState({ progress: pct })
        }
      })
      res.pipe(out)
      out.on('finish', resolve)
      out.on('error', reject)
      res.on('error', reject)
      req.on('error', reject)
    })

    activeRequest = null
    await fs.rename(partial, dest)
    setState({
      phase: 'ready',
      progress: 100,
      downloadedPath: dest,
      error: null,
    })
    return { ...state }
  } catch (err) {
    activeRequest = null
    await fs.rm(partial, { force: true }).catch(() => {})
    if (state.phase === 'dismissed') return { ...state }
    setState({
      phase: 'error',
      error: err instanceof Error ? err.message : String(err),
      progress: 0,
    })
    return { ...state }
  }
}

function cancelDownload() {
  if (activeRequest) {
    activeRequest.destroy()
    activeRequest = null
  }
}

function dismissUpdate() {
  cancelDownload()
  setState({
    phase: 'dismissed',
    progress: 0,
    error: null,
  })
  return { ...state }
}

async function openDownloaded() {
  if (!state.downloadedPath) return { ok: false }
  await shell.showItemInFolder(state.downloadedPath)
  return { ok: true }
}

async function relaunchDownloaded() {
  if (!state.downloadedPath) return { ok: false }
  const file = state.downloadedPath
  if (process.platform === 'linux') {
    await fs.chmod(file, 0o755).catch(() => {})
  }
  spawn(file, [], {
    detached: true,
    stdio: 'ignore',
  }).unref()
  app.quit()
  return { ok: true }
}

/** @param {() => import('electron').BrowserWindow | null} getWindow */
export function registerUpdater(getWindow) {
  getMainWindow = getWindow
  state.currentVersion = app.getVersion()
  state.packaged = app.isPackaged

  ipcMain.handle('updater:getState', () => ({ ...state }))
  ipcMain.handle('updater:check', () => checkForUpdate())
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:dismiss', () => dismissUpdate())
  ipcMain.handle('updater:openDownloaded', () => openDownloaded())
  ipcMain.handle('updater:relaunch', () => relaunchDownloaded())
}

/** @param {() => import('electron').BrowserWindow | null} getWindow */
export function scheduleUpdateCheck(getWindow) {
  getMainWindow = getWindow
  if (!app.isPackaged) return
  setTimeout(() => {
    void checkForUpdate()
  }, 2500)
}
