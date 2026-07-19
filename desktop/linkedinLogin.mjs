import { BrowserWindow, ipcMain, session } from 'electron'

const LOGIN_URL = 'https://www.linkedin.com/login'
const PARTITION = 'persist:linkedin-login'
const POLL_MS = 800
const TIMEOUT_MS = 10 * 60_000
const BLANK_CLOSE_MS = 600

const AUTH_HOST_RE =
  /(^|\.)linkedin\.com$|(^|\.)google\.com$|(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$|(^|\.)accounts\.youtube\.com$/i

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
 * Pós-OAuth (Google) costuma cair em about:blank com a janela branca.
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
function focusMainWindow(getMainWindow) {
  const main = getMainWindow?.()
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  if (!main.isVisible()) main.show()
  main.moveTop()
  main.focus()
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
    const ses = session.fromPartition(PARTITION)
    /** @type {Set<BrowserWindow>} */
    const windows = new Set()
    /** @type {Map<number, ReturnType<typeof setTimeout>>} */
    const blankTimers = new Map()

    /** @type {BrowserWindow | null} */
    let win = new BrowserWindow({
      width: 560,
      height: 780,
      minWidth: 420,
      minHeight: 560,
      title: 'LinkedIn',
      autoHideMenuBar: true,
      // Sem parent: evita o Windows mandar o app pra bandeja/desktop ao fechar a popup
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

    const clearBlankTimers = () => {
      for (const t of blankTimers.values()) clearTimeout(t)
      blankTimers.clear()
    }

    const cleanupTimers = () => {
      if (timer) clearInterval(timer)
      timer = null
      if (timeout) clearTimeout(timeout)
      timeout = null
      clearBlankTimers()
    }

    const closeAllWindows = () => {
      clearBlankTimers()
      for (const w of [...windows]) {
        windows.delete(w)
        if (!w.isDestroyed()) {
          w.removeAllListeners('closed')
          try {
            w.close()
          } catch {
            /* ignore */
          }
        }
      }
      // Qualquer janela órfã da mesma partition (Electron às vezes cria fora do handler)
      for (const w of BrowserWindow.getAllWindows()) {
        if (w.isDestroyed()) continue
        try {
          if (w.webContents?.session === ses) {
            w.removeAllListeners('closed')
            w.close()
          }
        } catch {
          /* ignore */
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
      // Volta o foco para Configurações (não deixa o Windows no desktop)
      setTimeout(() => focusMainWindow(getMainWindow), 50)
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
     * Cria popup OAuth sob nosso controle (em vez de action:allow),
     * para garantir mesma session e fechamento após redirect em branco.
     * @param {string} url
     * @param {BrowserWindow} [parentHost]
     */
    const openAuthPopup = (url, parentHost) => {
      if (settled) return null
      const child = new BrowserWindow({
        width: 520,
        height: 720,
        autoHideMenuBar: true,
        title: 'Sign In',
        webPreferences: {
          session: ses,
          partition: PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      })
      windows.add(child)
      wireWindow(child)
      child.on('closed', () => {
        windows.delete(child)
        void tryCapture()
        // Se só restava a popup e o login principal já sumiu, cancela
        if (
          !settled &&
          ![...windows].some((w) => !w.isDestroyed())
        ) {
          finish({ ok: false, cancelled: true })
        }
      })
      void child.loadURL(url).catch((err) => {
        console.warn('[linkedin-login] popup load failed', err)
      })
      if (parentHost && !parentHost.isDestroyed()) {
        // Mantém a janela de login LinkedIn atrás da popup, sem parent modal
        child.moveTop()
      }
      return child
    }

    /**
     * Fecha só popups OAuth que ficaram em branco — nunca a janela principal de login.
     * @param {BrowserWindow} host
     * @param {string} url
     */
    const scheduleBlankClose = (host, url) => {
      if (settled || host.isDestroyed()) return
      if (host === win) return
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
            try {
              host.close()
            } catch {
              /* ignore */
            }
          })
        }, BLANK_CLOSE_MS),
      )
    }

    /**
     * @param {BrowserWindow} host
     */
    const wireWindow = (host) => {
      host.webContents.setWindowOpenHandler(({ url }) => {
        if (!isAuthRelatedUrl(url)) {
          return { action: 'deny' }
        }
        openAuthPopup(url, host)
        return { action: 'deny' }
      })

      // Fallback: se o Chromium criar janela mesmo com deny, recria sob nosso controle
      host.webContents.on('did-create-window', (child, details) => {
        const url =
          (details && details.url) ||
          (() => {
            try {
              return child.webContents.getURL()
            } catch {
              return ''
            }
          })()
        try {
          child.destroy()
        } catch {
          /* ignore */
        }
        if (url && isAuthRelatedUrl(url)) {
          openAuthPopup(url, host)
        }
      })

      const onNav = (_event, url) => {
        void tryCapture()
        scheduleBlankClose(host, url)
      }

      host.webContents.on('did-navigate', onNav)
      host.webContents.on('did-navigate-in-page', () => {
        void tryCapture()
      })
      host.webContents.on('did-finish-load', () => {
        void tryCapture()
        try {
          const url = host.webContents.getURL()
          scheduleBlankClose(host, url)
        } catch {
          /* ignore */
        }
        // Google/LinkedIn às vezes deixam a popup branca sem about:blank
        if (host === win || host.isDestroyed()) return
        void host.webContents
          .executeJavaScript(
            `(() => {
              const b = document.body
              if (!b) return true
              const text = (b.innerText || '').replace(/\\s+/g, ' ').trim()
              const interactive = b.querySelectorAll('input, button, a, [role="button"]').length
              return text.length < 8 && interactive === 0
            })()`,
          )
          .then((empty) => {
            if (empty) scheduleBlankClose(host, 'about:blank')
          })
          .catch(() => {})
      })
      host.webContents.on('will-redirect', (_event, url) => {
        void tryCapture()
        scheduleBlankClose(host, url)
      })
      host.webContents.on('did-redirect-navigation', (_event, url) => {
        void tryCapture()
        scheduleBlankClose(host, url)
      })
    }

    wireWindow(win)

    win.on('closed', () => {
      windows.delete(win)
      win = null
      if (settled) return
      // Ainda há popup OAuth → não cancela; o poll / closed da popup decide
      if ([...windows].some((w) => !w.isDestroyed())) return
      finish({ ok: false, cancelled: true })
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

    win.focus()
  })
}
