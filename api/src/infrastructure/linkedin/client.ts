import { randomDelay } from '../../rateLimit.js'
import { log } from '../../logger.js'
import {
  markLinkedInSessionAuthFailure,
  markLinkedInSessionOk,
} from '../../linkedinSessionState.js'
import { getAppSettings } from '../../store.js'
import { SearchCancelledError } from '../../types.js'

export const LINKEDIN_BASE = 'https://www.linkedin.com'
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export const FETCH_TIMEOUT_MS = 25_000

export async function buildCookieHeader(): Promise<string | undefined> {
  const settings = await getAppSettings()
  const liAt = settings.linkedinLiAt.trim()
  const jsessionid = settings.linkedinJsessionId.trim()

  const parts: string[] = []
  if (liAt) parts.push(`li_at=${liAt}`)
  if (jsessionid) {
    const value = jsessionid.replace(/^"|"$/g, '')
    parts.push(`JSESSIONID="${value}"`)
  }

  return parts.length > 0 ? parts.join('; ') : undefined
}

/** CSRF do Voyager = valor do JSESSIONID (com ou sem prefixo ajax:). */
export async function buildCsrfToken(): Promise<string | undefined> {
  const settings = await getAppSettings()
  const raw = settings.linkedinJsessionId.trim().replace(/^"|"$/g, '')
  if (!raw) return undefined
  return raw.startsWith('ajax:') ? raw : `ajax:${raw}`
}

function formatNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return 'err:network_linkedin'
  if (err.message === 'fetch failed' || err.name === 'TypeError') {
    return 'err:network_linkedin'
  }
  // erros não-rede: manter mensagem só para log/diagnóstico interno → código genérico de rede se parecer fetch
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(err.message)) {
    return 'err:network_linkedin'
  }
  return err.message.startsWith('err:') ? err.message : 'err:network_linkedin'
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return false
  if (err.message === 'fetch failed' || err.name === 'TypeError') return true
  const code = (err as Error & { cause?: { code?: string } }).cause?.code
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET'
  )
}

function mergeAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const list = signals.filter((s): s is AbortSignal => Boolean(s))
  if (list.length === 0) return undefined
  if (list.length === 1) return list[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list)
  const ac = new AbortController()
  for (const s of list) {
    if (s.aborted) {
      ac.abort()
      return ac.signal
    }
    s.addEventListener('abort', () => ac.abort(), { once: true })
  }
  return ac.signal
}

export function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get('retry-after')
  if (!raw) return undefined
  const asInt = Number(raw)
  if (Number.isFinite(asInt) && asInt >= 0) return Math.ceil(asInt * 1000)
  const asDate = Date.parse(raw)
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now())
  return undefined
}

export function linkedInRateHeaders(res: Response): string {
  const interesting = [
    'retry-after',
    'x-li-uuid',
    'x-restli-protocol-version',
    'x-li-fabric',
    'cf-ray',
  ]
  const parts: string[] = []
  for (const name of interesting) {
    const value = res.headers.get(name)
    if (value) parts.push(`${name}=${value}`)
  }
  return parts.length > 0 ? ` · headers: ${parts.join(', ')}` : ''
}

export function throwLinkedInHttpError(res: Response): never {
  const retryAfterMs = parseRetryAfterMs(res)
  const waitSec = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 0
  let message: string
  if (res.status === 429) {
    message = `err:linkedin_429:${waitSec}`
  } else if (res.status === 401 || res.status === 403) {
    message = 'err:session_expired'
    markLinkedInSessionAuthFailure(res.status, 'err:session_expired')
    log.warn('linkedin.session.auth_http', { status: res.status })
  } else if (res.status === 999) {
    message = `err:linkedin_999:${waitSec}`
  } else {
    message = `err:http:${res.status}`
  }
  const err = new Error(message)
  if (retryAfterMs != null) {
    ;(err as Error & { retryAfterMs?: number }).retryAfterMs = retryAfterMs
  }
  ;(err as Error & { linkedInStatus?: number }).linkedInStatus = res.status
  throw err
}

export async function linkedInFetch(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const cookie = await buildCookieHeader()
  const url = `${LINKEDIN_BASE}${path}`
  const maxAttempts = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new SearchCancelledError([])
    const timeout =
      typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        : undefined
    const combined = mergeAbortSignals(signal, timeout)
    try {
      const res = await fetch(url, {
        signal: combined,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      })

      if (!res.ok) {
        if (res.status === 429 && attempt < maxAttempts) {
          const wait = parseRetryAfterMs(res) ?? 1500 * attempt
          console.warn(
            `[linkedin] HTTP 429 · tentativa ${attempt}/${maxAttempts} · aguardando ${Math.ceil(wait / 1000)}s`,
          )
          log.warn('linkedin.http.429', {
            attempt,
            maxAttempts,
            waitMs: wait,
          })
          await randomDelay(wait, wait + 500)
          continue
        }
        throwLinkedInHttpError(res)
      }

      return res.text()
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {

        if (
          !signal?.aborted &&
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError')
        ) {
          lastErr = new Error(
            `LinkedIn não respondeu a tempo (${FETCH_TIMEOUT_MS / 1000}s).`,
          )
          if (attempt === maxAttempts) throw lastErr
          await randomDelay(400 * attempt, 900 * attempt)
          continue
        }
        throw err
      }

      if (
        err instanceof Error &&
        (err.message.startsWith('LinkedIn bloqueou') ||
          err.message.startsWith('LinkedIn rate limit') ||
          err.message.startsWith('LinkedIn respondeu') ||
          err.message.startsWith('LinkedIn não respondeu'))
      ) {
        throw err
      }
      lastErr = err
      if (!isRetryableNetworkError(err) || attempt === maxAttempts) {
        throw new Error(formatNetworkError(err))
      }
      await randomDelay(400 * attempt, 900 * attempt)
    }
  }

  throw new Error(formatNetworkError(lastErr))
}

/**
 * JSON autenticado do Voyager (precisa li_at + JSESSIONID).
 * Usado para workplaceTypes (híbrido/presencial/remoto) e descrição estruturada.
 */
export async function linkedInVoyagerFetch(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const cookie = await buildCookieHeader()
  const csrf = await buildCsrfToken()
  if (!cookie || !csrf) {
    throw new Error('err:cookie_incomplete')
  }

  const url = path.startsWith('http') ? path : `${LINKEDIN_BASE}${path}`
  const maxAttempts = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new SearchCancelledError([])
    const timeout =
      typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        : undefined
    const combined = mergeAbortSignals(signal, timeout)
    try {
      const res = await fetch(url, {
        signal: combined,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.linkedin.normalized+json+2.1',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'csrf-token': csrf,
          'x-restli-protocol-version': '2.0.0',
          'x-li-lang': 'pt_BR',
          Cookie: cookie,
        },
      })

      if (!res.ok) {
        if (res.status === 429 && attempt < maxAttempts) {
          const wait = parseRetryAfterMs(res) ?? 1500 * attempt
          console.warn(
            `[linkedin] Voyager HTTP 429 · tentativa ${attempt}/${maxAttempts} · aguardando ${Math.ceil(wait / 1000)}s`,
          )
          log.warn('linkedin.voyager.429', {
            attempt,
            maxAttempts,
            waitMs: wait,
          })
          await randomDelay(wait, wait + 500)
          continue
        }
        throwLinkedInHttpError(res)
      }

      markLinkedInSessionOk()
      return res.json()
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        if (
          !signal?.aborted &&
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError')
        ) {
          lastErr = new Error(
            `LinkedIn Voyager não respondeu a tempo (${FETCH_TIMEOUT_MS / 1000}s).`,
          )
          if (attempt === maxAttempts) throw lastErr
          await randomDelay(400 * attempt, 900 * attempt)
          continue
        }
        throw err
      }

      if (
        err instanceof Error &&
        (err.message.startsWith('LinkedIn bloqueou') ||
          err.message.startsWith('LinkedIn rate limit') ||
          err.message.startsWith('LinkedIn respondeu') ||
          err.message.startsWith('LinkedIn não respondeu') ||
          err.message.startsWith('Cookie LinkedIn'))
      ) {
        throw err
      }
      lastErr = err
      if (!isRetryableNetworkError(err) || attempt === maxAttempts) {
        throw new Error(formatNetworkError(err))
      }
      await randomDelay(400 * attempt, 900 * attempt)
    }
  }

  throw new Error(formatNetworkError(lastErr))
}
