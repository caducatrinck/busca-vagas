import { log } from './logger.js'
import {
  clearLinkedInFetchGuards,
  linkedInVoyagerFetch,
} from './infrastructure/linkedin/client.js'
import {
  getLinkedInSessionStatus,
  markLinkedInSessionOk,
  setLinkedInSessionStatus,
  type LinkedInSessionStatus,
} from './linkedinSessionState.js'
import { getAppSettings, isAppConfigured } from './store.js'

export type { LinkedInSessionStatus }
export {
  getLinkedInSessionStatus,
  markLinkedInSessionOk,
} from './linkedinSessionState.js'

let probeInFlight: Promise<LinkedInSessionStatus> | null = null
let lastProbeAt = 0

export async function syncLinkedInSessionFromCookies(): Promise<LinkedInSessionStatus> {
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
  markLinkedInSessionOk()
  return getLinkedInSessionStatus()
}

export async function probeLinkedInSession(
  options: { force?: boolean; clearGuards?: boolean } = {},
): Promise<LinkedInSessionStatus> {
  const now = Date.now()
  if (probeInFlight) return probeInFlight
  if (!options.force && now - lastProbeAt < 15_000) {
    return syncLinkedInSessionFromCookies()
  }

  probeInFlight = (async () => {
    lastProbeAt = Date.now()
    if (options.clearGuards) clearLinkedInFetchGuards()

    const status = await syncLinkedInSessionFromCookies()
    if (!status.ok) return status

    try {
      await linkedInVoyagerFetch('/voyager/api/me', undefined, { probe: true })
      log.info('linkedin.session.voyager_ok')
    } catch (err) {
      const httpStatus =
        err instanceof Error
          ? ((err as Error & { linkedInStatus?: number }).linkedInStatus ?? null)
          : null
      const message = err instanceof Error ? err.message : String(err)
      log.warn('linkedin.session.voyager_diag', { httpStatus, message })
    }

    return syncLinkedInSessionFromCookies()
  })().finally(() => {
    probeInFlight = null
  })

  return probeInFlight
}
