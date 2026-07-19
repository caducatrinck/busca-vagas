import { BrowserWindow, ipcMain, session } from 'electron'

const LOGIN_URL = 'https://www.linkedin.com/login'
const PARTITION = 'persist:linkedin-login'
const POLL_MS = 1_000
const TIMEOUT_MS = 10 * 60_000

const AUTH_HOST_RE =
  /(^|\.)linkedin\.com$|(^|\.)google\.com$|(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$/i

/**
 * @param {string | undefined} value
 */
function stripCookieQuotes(value) {
  let next = String(value ?? '').trim()
  for (let i = 0; i < 4; i++) {
    const first = next[0]
    const last = next[next.length - 1]
    const paired =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === '\u201c' && last === '\u201d') ||
      (first === '\u2018' && last === '\u2019')
    if (!paired || next.length < 2) break
    next = next.slice(1, -1).trim()
  }
  return next
}

/**
 * @param {string} url
 */
function isAuthRelatedUrl(url) {
  try {
    const host = new URL(url).hostname
    return AUTH_HOST_RE.test(host)
  } catch {
    return false
  }
}

/**
 * @param {import('electron').Session} ses
 */
async function readLinkedInCookies(ses) {
  const cookies = await ses.cookies.get({ url: 'https://www.linkedin.com' })
  const byName = new Map(cookies.map((c) => [c.name, c.value]))
  const liAt = stripCookieQuotes(byName.get('li_at'))
  const jsession = stripCookieQuotes(byName.get('JSESSIONID'))
  if (!liAt || !jsession) return null
  return { linkedinLiAt: liAt, linkedinJsessionId: jsession }
}

/**
 * @param {() => BrowserWindow | null} getMainWindow
 */
export function registerLinkedInLogin(getMainWindow) {
  ipcMain.removeHandler('linkedin:login')
  ipcMain.removeHandler('linkedin:logout')
  ipcMain.handle('linkedin:login', async () => openLinkedInLogin(getMainWindow))
  ipcMain.handle('linkedin:logout', async () => clearLinkedInLoginSession())
}

async function clearLinkedInLoginSession() {
  try {
    const ses = session.fromPartition(PARTITION)
    await ses.clearStorageData()
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * @param {() => BrowserWindow | null} getMainWindow
 */
function openLinkedInLogin(getMainWindow) {
  return new Promise((resolve) => {
    const parent = getMainWindow?.() ?? undefined
    const ses = session.fromPartition(PARTITION)
    /** @type {Set<BrowserWindow>} */
    const windows = new Set()

    /** @type {BrowserWindow | null} */
    let win = new BrowserWindow({
      width: 560,
      height: 780,
      minWidth: 420,
      minHeight: 560,
      title: 'LinkedIn',
      autoHideMenuBar: true,
      ...(parent && !parent.isDestroyed() ? { parent, modal: false } : {}),
      webPreferences: {
        session: ses,
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    windows.add(win)

    let settled = false
    /** @type {ReturnType<typeof setInterval> | null} */
    let timer = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeout = null

    const cleanupTimers = () => {
      if (timer) clearInterval(timer)
      timer = null
      if (timeout) clearTimeout(timeout)
      timeout = null
    }

    const closeAllWindows = () => {
      for (const w of [...windows]) {
        windows.delete(w)
        if (!w.isDestroyed()) {
          w.removeAllListeners('closed')
          w.close()
        }
      }
      win = null
    }

    /**
     * @param {{
     *   ok: boolean
     *   cancelled?: boolean
     *   timedOut?: boolean
     *   linkedinLiAt?: string
     *   linkedinJsessionId?: string
     *   error?: string
     * }} result
     */
    const finish = (result) => {
      if (settled) return
      settled = true
      cleanupTimers()
      closeAllWindows()
      resolve(result)
    }

    const tryCapture = async () => {
      if (settled) return
      try {
        const cookies = await readLinkedInCookies(ses)
        if (!cookies) return
        finish({ ok: true, ...cookies })
      } catch (err) {
        console.warn('[linkedin-login] cookie read failed', err)
      }
    }

    /**
     * Popups do Google/LinkedIn (Sign in with Google) — mesma session/partition.
     * Sem isso a janela fica branca após o OAuth.
     * @param {BrowserWindow} host
     */
    const wireWindow = (host) => {
      host.webContents.setWindowOpenHandler(({ url }) => {
        if (!isAuthRelatedUrl(url)) {
          return { action: 'deny' }
        }
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 720,
            autoHideMenuBar: true,
            parent: host,
            webPreferences: {
              session: ses,
              partition: PARTITION,
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        }
      })

      host.webContents.on('did-create-window', (child) => {
        windows.add(child)
        wireWindow(child)
        child.on('closed', () => {
          windows.delete(child)
          void tryCapture()
        })
        child.webContents.on('did-finish-load', () => {
          void tryCapture()
        })
        child.webContents.on('did-navigate', () => {
          void tryCapture()
        })
      })

      host.webContents.on('did-navigate', () => {
        void tryCapture()
      })
      host.webContents.on('did-navigate-in-page', () => {
        void tryCapture()
      })
      host.webContents.on('did-finish-load', () => {
        void tryCapture()
      })
      host.webContents.on('will-redirect', () => {
        void tryCapture()
      })
    }

    wireWindow(win)

    win.on('closed', () => {
      windows.delete(win)
      win = null
      // Só cancela se nenhuma popup OAuth ainda estiver aberta.
      if (![...windows].some((w) => !w.isDestroyed())) {
        finish({ ok: false, cancelled: true })
      }
    })

    timer = setInterval(() => {
      void tryCapture()
    }, POLL_MS)

    timeout = setTimeout(() => {
      finish({ ok: false, timedOut: true })
    }, TIMEOUT_MS)

    void win.loadURL(LOGIN_URL).catch((err) => {
      finish({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    })
  })
}
