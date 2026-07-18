import type { FastifyInstance } from 'fastify'
import type { StoreRepository } from '../../application/ports.js'
import { setMonitorPolling, syncSchedulers } from '../../poller.js'
import { searchRateLimiter } from '../../rateLimit.js'
import {
  getLinkedInSessionStatus,
  probeLinkedInSession,
} from '../../linkedinSession.js'
import type { AppSettings, JobFilters, StoreData, ThemeMode } from '../../store.js'

export function registerSettingsRoutes(
  app: FastifyInstance,
  deps: { repo: StoreRepository },
) {
  const { repo } = deps

  app.get('/rate-limit', async () => searchRateLimiter.snapshot())

  app.get('/linkedin/session', async () => getLinkedInSessionStatus())

  app.post('/linkedin/session/check', async () =>
    probeLinkedInSession({ force: true }),
  )

  app.get('/settings', async () => {
    const settings = await repo.getAppSettings()
    return repo.toPublicSettings(settings)
  })

  app.patch<{
    Body: Partial<AppSettings> & {
      clearLinkedinLiAt?: boolean
      clearLinkedinJsessionId?: boolean
    }
  }>('/settings', async (request) => {
    const body = request.body ?? {}
    const settings = await repo.updateAppSettings(body)
    searchRateLimiter.updateConfig({
      minIntervalMs: settings.searchCooldownMs,
      maxPerHour: settings.maxSearchesPerHour,
      maxPerDay: settings.maxSearchesPerDay,
    })
    if (!(await Promise.resolve(repo.isAppConfigured(settings)))) {
      const monitors = await repo.listMonitors()
      for (const m of monitors) {
        if (m.pollingEnabled) await setMonitorPolling(m.id, false)
      }
    } else if (
      typeof body.linkedinLiAt === 'string' ||
      typeof body.linkedinJsessionId === 'string' ||
      body.clearLinkedinLiAt ||
      body.clearLinkedinJsessionId
    ) {
      // cookie mudou — revalida sessão
      void probeLinkedInSession({ force: true })
    }
    return repo.toPublicSettings(settings)
  })

  app.get('/prefs', async () => repo.getUiPrefs())

  app.put<{
    Body: {
      filters?: JobFilters
      theme?: ThemeMode
      locale?: 'pt' | 'en'
    }
  }>('/prefs', async (request) => {
    const body = request.body ?? {}
    return repo.updateUiPrefs({
      filters: body.filters,
      theme: body.theme,
      locale: body.locale,
    })
  })

  app.get('/data/export', async () => {
    const store = await repo.exportStoreData()
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      store,
    }
  })

  app.post<{
    Body: {
      version?: number
      store?: Partial<StoreData>
      jobs?: StoreData['jobs']
      monitors?: StoreData['monitors']
      filters?: JobFilters
      theme?: ThemeMode
    }
  }>('/data/import', { bodyLimit: 20 * 1024 * 1024 }, async (request, reply) => {
    const body = request.body ?? {}
    const storePayload: Partial<StoreData> =
      body.store && typeof body.store === 'object'
        ? { ...body.store }
        : {
            jobs: body.jobs,
            monitors: body.monitors,
          }

    // Backups antigos: filters/theme no topo do JSON
    if (!storePayload.filters && body.filters) {
      storePayload.filters = body.filters
    }
    if (storePayload.theme === undefined && body.theme) {
      storePayload.theme = body.theme
    }

    if (!storePayload.jobs || typeof storePayload.jobs !== 'object') {
      return reply.status(400).send({
        error: 'err:invalid_backup',
      })
    }

    const store = await repo.replaceStoreData(storePayload)
    searchRateLimiter.hydrate(store.rateLimit)
    searchRateLimiter.updateConfig({
      minIntervalMs: store.settings.searchCooldownMs,
      maxPerHour: store.settings.maxSearchesPerHour,
      maxPerDay: store.settings.maxSearchesPerDay,
    })
    await syncSchedulers()
    return {
      ok: true,
      jobs: Object.keys(store.jobs).length,
      monitors: store.monitors.length,
    }
  })
}
