import { BrowserWindow, ipcMain, session } from 'electron'

const LOGIN_URL = 'https://www.linkedin.com/login'
const FEED_URL = 'https://www.linkedin.com/feed/'
const PARTITION = 'persist:linkedin-login'
const POLL_MS = 700
const TIMEOUT_MS = 10 * 60_000
const POST_POPUP_RETRY_MS = 4_000
const JSESSION_WAIT_MS = 2_500
const REFRESH_DELAY_MS = 250
const BLANK_CLOSE_MS = 700

const AUTH_HOST_RE =
  /(^|\.)linkedin\.com$|(^|\.)google\.com$|(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$|(^|\.)accounts\.youtube\.com$|(^|\.)microsoftonline\.com$|(^|\.)microsoft\.com$|(^|\.)live\.com$|(^|\.)office\.com$|(^|\.)apple\.com$|(^|\.)appleid\.apple\.com$/i

const EMPTY_POPUP_PROBE = `(() => {
  const b = document.body
  if (!b) return true
  const text = (b.innerText || '').replace(/\\s+/g, ' ').trim()
  const interactive = b.querySelectorAll('input, button, a, [role="button"]').length
  return text.length < 8 && interactive === 0
})()`

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
    return AUTH_HOST_RE.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * @param {string} url
 */
function isLoginUrl(url) {
  return /\/login/i.test(url) || /uas\/login/i.test(url)
}

/**
 * @param {string} url
 */
function isPostAuthBlankUrl(url) {
  const raw = String(url ?? '').trim()
  if (!raw || raw === 'about:blank') return true
  try {
    return new URL(raw).protocol === 'about:'
  } catch {
    return false
  }
}

/**
 * @param {string | undefined} domain
 */
function isLinkedInCookieDomain(domain) {
  const host = String(domain ?? '')
    .replace(/^\./, '')
    .toLowerCase()
  return host === 'linkedin.com' || host.endsWith('.linkedin.com')
}

/**
 * @param {import('electron').Session} ses
 * @param {{ requireJsession?: boolean }} [opts]
 */
async function readLinkedInCookies(ses, opts = {}) {
  const requireJsession = opts.requireJsession !== false
  const cookies = await ses.cookies.get({})
  /** @type {Map<string, string>} */
  const byName = new Map()
  for (const c of cookies) {
    if (!isLinkedInCookieDomain(c.domain)) continue
    byName.set(c.name, c.value)
    byName.set(c.name.toLowerCase(), c.value)
  }
  const liAt = stripCookieQuotes(byName.get('li_at'))
  const jsession = stripCookieQuotes(
    byName.get('JSESSIONID') || byName.get('jsessionid'),
  )
  if (!liAt) return null
  if (requireJsession && !jsession) return null
  return { linkedinLiAt: liAt, linkedinJsessionId: jsession || '' }
}

/**
 * @param {() => BrowserWindow | null} getMainWindow
 */
function focusMainWindow(getMainWindow) {
  const main = getMainWindow?.()
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  if (!main.isVisible()) main.show()
  main.moveTop()
  main.focus()
}

/**
 * @param {BrowserWindow} w
 * @param {import('electron').Session} ses
 */
function windowUsesLoginSession(w, ses) {
  if (w.isDestroyed()) return false
  try {
    const ws = w.webContents?.session
    if (!ws) return false
    if (ws === ses) return true
    return ws.getStoragePath?.() === ses.getStoragePath?.()
  } catch {
    return false
  }
}

/**
 * @param {import('electron').Session} ses
 */
function loginWebPreferences(ses) {
  return {
    session: ses,
    partition: PARTITION,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  }
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
    await session.fromPartition(PARTITION).clearStorageData()
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
    const ses = session.fromPartition(PARTITION)
    /** @type {Set<BrowserWindow>} */
    const windows = new Set()
    /** @type {Map<number, ReturnType<typeof setTimeout>>} */
    const blankTimers = new Map()
    /** @type {ReturnType<typeof setTimeout>[]} */
    const looseTimers = []

    /** @type {BrowserWindow | null} */
    let win = new BrowserWindow({
      width: 560,
      height: 780,
      minWidth: 420,
      minHeight: 560,
      title: 'LinkedIn',
      autoHideMenuBar: true,
      webPreferences: loginWebPreferences(ses),
    })
    windows.add(win)

    let settled = false
    let pendingLoginRefresh = false
    let liAtSeenAt = 0
    /** @type {ReturnType<typeof setInterval> | null} */
    let pollTimer = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutTimer = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let postPopupTimer = null

    const schedule = (fn, ms) => {
      const id = setTimeout(fn, ms)
      looseTimers.push(id)
      return id
    }

    const clearAllTimers = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      if (timeoutTimer) clearTimeout(timeoutTimer)
      timeoutTimer = null
      if (postPopupTimer) clearTimeout(postPopupTimer)
      postPopupTimer = null
      for (const t of blankTimers.values()) clearTimeout(t)
      blankTimers.clear()
      for (const t of looseTimers) clearTimeout(t)
      looseTimers.length = 0
      try {
        ses.cookies.removeListener('changed', onCookieChanged)
      } catch {
        /* ignore */
      }
    }

    const forceClose = (w) => {
      if (!w || w.isDestroyed()) return
      try {
        w.removeAllListeners('closed')
      } catch {
        /* ignore */
      }
      try {
        w.destroy()
      } catch {
        try {
          w.close()
        } catch {
          /* ignore */
        }
      }
    }

    const closeAllWindows = () => {
      for (const w of [...windows]) {
        windows.delete(w)
        forceClose(w)
      }
      for (const w of BrowserWindow.getAllWindows()) {
        if (windowUsesLoginSession(w, ses)) forceClose(w)
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
      clearAllTimers()
      closeAllWindows()
      setTimeout(() => focusMainWindow(getMainWindow), 50)
      resolve(result)
    }

    const tryCapture = async () => {
      if (settled) return
      try {
        const both = await readLinkedInCookies(ses, { requireJsession: true })
        if (both) {
          finish({ ok: true, ...both })
          return
        }
        const partial = await readLinkedInCookies(ses, { requireJsession: false })
        if (!partial) return
        if (!liAtSeenAt) liAtSeenAt = Date.now()
        if (Date.now() - liAtSeenAt >= JSESSION_WAIT_MS) {
          finish({ ok: true, ...partial })
        }
      } catch (err) {
        console.warn('[linkedin-login] cookie read failed', err)
      }
    }

    const refreshLoginWindow = () => {
      if (settled || !win || win.isDestroyed()) return
      pendingLoginRefresh = true
      try {
        win.webContents.reloadIgnoringCache()
      } catch {
        pendingLoginRefresh = false
        void win.loadURL(FEED_URL).catch(() => {})
      }
    }

    /** Popup de e-mail/OAuth fecha e /login fica stale — F5 aplica a session. */
    const afterPopupClosed = () => {
      if (settled) return
      void tryCapture()
      if (postPopupTimer) clearTimeout(postPopupTimer)

      schedule(() => {
        if (!settled) refreshLoginWindow()
      }, REFRESH_DELAY_MS)

      const started = Date.now()
      const tick = () => {
        if (settled) return
        void tryCapture()
        if (Date.now() - started >= POST_POPUP_RETRY_MS) return
        postPopupTimer = setTimeout(tick, 400)
      }
      postPopupTimer = setTimeout(tick, 400)
    }

    /**
     * @param {import('electron').Event} _event
     * @param {Electron.Cookie} cookie
     * @param {string} _cause
     * @param {boolean} removed
     */
    const onCookieChanged = (_event, cookie, _cause, removed) => {
      if (removed || settled) return
      const name = String(cookie?.name || '').toLowerCase()
      if (name === 'li_at' || name === 'jsessionid') void tryCapture()
    }
    ses.cookies.on('changed', onCookieChanged)

    /**
     * @param {BrowserWindow} host
     * @param {string} url
     */
    const scheduleBlankClose = (host, url) => {
      if (settled || host.isDestroyed() || host === win) return
      if (!isPostAuthBlankUrl(url)) return
      const id = host.id
      const prev = blankTimers.get(id)
      if (prev) clearTimeout(prev)
      blankTimers.set(
        id,
        setTimeout(() => {
          blankTimers.delete(id)
          if (settled || host.isDestroyed()) return
          void tryCapture().finally(() => {
            if (settled || host.isDestroyed()) return
            forceClose(host)
            windows.delete(host)
            afterPopupClosed()
          })
        }, BLANK_CLOSE_MS),
      )
    }

    /**
     * `allow` + mesma session preserva window.opener (necessário no login e-mail).
     * @param {BrowserWindow} host
     */
    const wireWindow = (host) => {
      host.webContents.setWindowOpenHandler(({ url }) => {
        if (!isAuthRelatedUrl(url)) return { action: 'deny' }
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 720,
            autoHideMenuBar: true,
            webPreferences: loginWebPreferences(ses),
          },
        }
      })

      host.webContents.on('did-create-window', (child) => {
        windows.add(child)
        wireWindow(child)
        child.on('closed', () => {
          windows.delete(child)
          afterPopupClosed()
        })
      })

      /** @param {string} url */
      const onUrl = (url) => {
        void tryCapture()
        scheduleBlankClose(host, url)
      }

      host.webContents.on('did-navigate', (_e, url) => onUrl(url))
      host.webContents.on('did-navigate-in-page', (_e, url) => onUrl(url))
      host.webContents.on('will-redirect', (_e, url) => onUrl(url))
      host.webContents.on('did-redirect-navigation', (_e, url) => onUrl(url))
      host.webContents.on('did-finish-load', () => {
        if (settled || host.isDestroyed()) return
        void tryCapture()
        let url = ''
        try {
          url = host.webContents.getURL()
          onUrl(url)
        } catch {
          /* ignore */
        }

        if (host === win && pendingLoginRefresh) {
          pendingLoginRefresh = false
          if (isLoginUrl(url)) {
            void host.loadURL(FEED_URL).catch(() => {})
          }
          return
        }

        if (host === win) return
        void host.webContents
          .executeJavaScript(EMPTY_POPUP_PROBE)
          .then((empty) => {
            if (empty) scheduleBlankClose(host, 'about:blank')
          })
          .catch(() => {})
      })
    }

    wireWindow(win)

    win.on('closed', () => {
      windows.delete(win)
      win = null
      if (settled) return
      if ([...windows].some((w) => !w.isDestroyed())) return
      finish({ ok: false, cancelled: true })
    })

    pollTimer = setInterval(() => {
      void tryCapture()
    }, POLL_MS)

    timeoutTimer = setTimeout(() => {
      finish({ ok: false, timedOut: true })
    }, TIMEOUT_MS)

    void win.loadURL(LOGIN_URL).catch((err) => {
      finish({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    win.focus()
  })
}
