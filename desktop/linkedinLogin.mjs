import { BrowserWindow, ipcMain } from 'electron'

const LOGIN_URL = 'https://www.linkedin.com/login'
const PARTITION = 'persist:linkedin-login'
const POLL_MS = 1_200
const TIMEOUT_MS = 10 * 60_000

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
 * @param {import('electron').Session} session
 */
async function readLinkedInCookies(session) {
  const cookies = await session.cookies.get({ url: 'https://www.linkedin.com' })
  const byName = new Map(cookies.map((c) => [c.name, c.value]))
  const liAt = stripCookieQuotes(byName.get('li_at'))
  const jsession = stripCookieQuotes(byName.get('JSESSIONID'))
  if (!liAt || !jsession) return null
  return { linkedinLiAt: liAt, linkedinJsessionId: jsession }
}

/**
 * Abre janela de login do LinkedIn e devolve li_at + JSESSIONID.
 * @param {() => BrowserWindow | null} getMainWindow
 */
export function registerLinkedInLogin(getMainWindow) {
  ipcMain.removeHandler('linkedin:login')
  ipcMain.handle('linkedin:login', async () => openLinkedInLogin(getMainWindow))
}

/**
 * @param {() => BrowserWindow | null} getMainWindow
 * @returns {Promise<{
 *   ok: boolean
 *   cancelled?: boolean
 *   timedOut?: boolean
 *   linkedinLiAt?: string
 *   linkedinJsessionId?: string
 *   error?: string
 * }>}
 */
function openLinkedInLogin(getMainWindow) {
  return new Promise((resolve) => {
    const parent = getMainWindow?.() ?? undefined
    /** @type {BrowserWindow | null} */
    let win = new BrowserWindow({
      width: 560,
      height: 780,
      minWidth: 420,
      minHeight: 560,
      title: 'LinkedIn',
      autoHideMenuBar: true,
      ...(parent && !parent.isDestroyed()
        ? { parent, modal: false }
        : {}),
      webPreferences: {
        partition: PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    let settled = false
    /** @type {ReturnType<typeof setInterval> | null} */
    let timer = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeout = null

    const cleanup = () => {
      if (timer) clearInterval(timer)
      timer = null
      if (timeout) clearTimeout(timeout)
      timeout = null
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
      cleanup()
      const target = win
      win = null
      if (target && !target.isDestroyed()) {
        target.removeAllListeners('closed')
        target.close()
      }
      resolve(result)
    }

    const tryCapture = async () => {
      if (settled || !win || win.isDestroyed()) return
      try {
        const cookies = await readLinkedInCookies(win.webContents.session)
        if (!cookies) return
        finish({ ok: true, ...cookies })
      } catch (err) {
        console.warn('[linkedin-login] cookie read failed', err)
      }
    }

    win.on('closed', () => {
      win = null
      finish({ ok: false, cancelled: true })
    })

    win.webContents.on('did-navigate', () => {
      void tryCapture()
    })
    win.webContents.on('did-navigate-in-page', () => {
      void tryCapture()
    })
    win.webContents.on('did-finish-load', () => {
      void tryCapture()
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
