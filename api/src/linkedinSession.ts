import { log } from './logger.js'
import { linkedInVoyagerFetch } from './infrastructure/linkedin/client.js'
import {
  getLinkedInSessionStatus,
  markLinkedInSessionAuthFailure,
  markLinkedInSessionOk,
  setLinkedInSessionStatus,
  type LinkedInSessionStatus,
} from './linkedinSessionState.js'
import { getAppSettings, isAppConfigured } from './store.js'

export type { LinkedInSessionStatus }
export {
  getLinkedInSessionStatus,
  markLinkedInSessionAuthFailure,
  markLinkedInSessionOk,
} from './linkedinSessionState.js'

let probeInFlight: Promise<LinkedInSessionStatus> | null = null
let lastProbeAt = 0

export async function probeLinkedInSession(
  options: { force?: boolean } = {},
): Promise<LinkedInSessionStatus> {
  const now = Date.now()
  if (!options.force && probeInFlight) return probeInFlight
  if (!options.force && now - lastProbeAt < 15_000) {
    return getLinkedInSessionStatus()
  }

  probeInFlight = (async () => {
    lastProbeAt = Date.now()
    const settings = await getAppSettings()
    if (!isAppConfigured(settings)) {
      return setLinkedInSessionStatus({
        ok: false,
        code: 'missing',
        message: 'err:missing_li_at',
        checkedAt: new Date().toISOString(),
        httpStatus: null,
      })
    }

    if (!settings.linkedinJsessionId.trim()) {
      return setLinkedInSessionStatus({
        ok: false,
        code: 'incomplete',
        message: 'err:cookie_incomplete',
        checkedAt: new Date().toISOString(),
        httpStatus: null,
      })
    }

    try {
      await linkedInVoyagerFetch('/voyager/api/me')
      markLinkedInSessionOk()
      log.info('linkedin.session.ok')
    } catch (err) {
      const httpStatus =
        err instanceof Error
          ? ((err as Error & { linkedInStatus?: number }).linkedInStatus ?? null)
          : null
      const message = err instanceof Error ? err.message : String(err)
      const prev = getLinkedInSessionStatus()

      if (httpStatus === 401 || httpStatus === 403) {
        markLinkedInSessionAuthFailure(
          httpStatus,
          'err:session_expired',
        )
      } else if (/Cookie LinkedIn incompleto/i.test(message)) {
        setLinkedInSessionStatus({
          ok: false,
          code: 'incomplete',
          message: 'err:cookie_incomplete',
          checkedAt: new Date().toISOString(),
          httpStatus: null,
        })
      } else if (httpStatus === 429) {
        if (!prev.ok) {
          setLinkedInSessionStatus({
            ...prev,
            checkedAt: new Date().toISOString(),
            message: 'err:session_rate_limited',
            httpStatus: 429,
          })
        } else {
          setLinkedInSessionStatus({
            ...prev,
            checkedAt: new Date().toISOString(),
          })
        }
      } else {
        setLinkedInSessionStatus({
          ok: false,
          code: /rede|network|fetch failed|timeout/i.test(message)
            ? 'network'
            : 'unknown',
          message,
          checkedAt: new Date().toISOString(),
          httpStatus,
        })
      }
      log.warn('linkedin.session.probe_failed', {
        code: getLinkedInSessionStatus().code,
        httpStatus,
        message: getLinkedInSessionStatus().message,
      })
    }

    return getLinkedInSessionStatus()
  })().finally(() => {
    probeInFlight = null
  })

  return probeInFlight
}
