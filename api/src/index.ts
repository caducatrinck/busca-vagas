import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { searchLinkedInJobs } from './linkedin.js'
import {
  getMonitorStatus,
  listMonitorStatuses,
  restoreSchedulersFromDisk,
  runMonitorNow,
  setMonitorPolling,
  syncSchedulers,
  cancelMonitorRun,
  isMonitorRunning,
} from './poller.js'
import { searchRateLimiter, restoreRateLimitFromDisk } from './rateLimit.js'
import {
  createMonitorRecord,
  deleteMonitor,
  exportStoreData,
  getAppSettings,
  getMonitor,
  listJobs,
  listMonitors,
  getJobSearchHints,
  isAppConfigured,
  replaceStoreData,
  setJobApplied,
  setJobStatus,
  deleteJobsByStatus,
  toPublicSettings,
  updateAppSettings,
  updateMonitor,
  upsertSearchResults,
  withNewFlag,
  type AppSettings,
  type JobStatus,
  type StoreData,
} from './store.js'
import type { SearchParams } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config()

const PORT = Number(process.env.API_PORT || 8787)
const HOST = process.env.API_HOST || '127.0.0.1'
const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:80,http://localhost'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: CORS_ORIGINS,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
})

app.get('/health', async () => ({ ok: true }))

const SETTINGS_REQUIRED_MSG =
  'Configure o cookie li_at em Configurações antes de buscar vagas.'

async function rejectIfNotConfigured(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
) {
  const settings = await getAppSettings()
  if (isAppConfigured(settings)) return null
  return reply.status(503).send({
    error: SETTINGS_REQUIRED_MSG,
    settingsRequired: true,
    settings: toPublicSettings(settings),
  })
}

app.get('/rate-limit', async () => searchRateLimiter.snapshot())

app.get('/settings', async () => {
  const settings = await getAppSettings()
  return toPublicSettings(settings)
})

app.patch<{
  Body: Partial<AppSettings> & {
    clearLinkedinLiAt?: boolean
    clearLinkedinJsessionId?: boolean
  }
}>('/settings', async (request) => {
  const body = request.body ?? {}
  const settings = await updateAppSettings(body)
  searchRateLimiter.updateConfig({
    minIntervalMs: settings.searchCooldownMs,
    maxPerHour: settings.maxSearchesPerHour,
    maxPerDay: settings.maxSearchesPerDay,
  })
  if (!isAppConfigured(settings)) {
    const monitors = await listMonitors()
    for (const m of monitors) {
      if (m.pollingEnabled) await setMonitorPolling(m.id, false)
    }
  }
  return toPublicSettings(settings)
})

app.get('/data/export', async () => {
  const store = await exportStoreData()
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
  }
}>('/data/import', { bodyLimit: 20 * 1024 * 1024 }, async (request, reply) => {
  const body = request.body ?? {}
  const storePayload: Partial<StoreData> =
    body.store && typeof body.store === 'object'
      ? body.store
      : {
          jobs: body.jobs,
          monitors: body.monitors,
        }

  if (!storePayload.jobs || typeof storePayload.jobs !== 'object') {
    return reply.status(400).send({
      error: 'Arquivo inválido: esperado store.jobs (objeto)',
    })
  }

  const store = await replaceStoreData(storePayload)
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

app.get('/jobs', async (request) => {
  const query = request.query as {
    applied?: string
    monitorId?: string
    status?: string
    excludeDiscarded?: string
  }
  const status =
    query.status === 'viewed' ||
    query.status === 'applied' ||
    query.status === 'discarded'
      ? (query.status as JobStatus)
      : undefined
  const jobs = await listJobs({
    status,
    appliedOnly: !status && query.applied === 'true',
    monitorId: query.monitorId,
    excludeDiscarded: query.excludeDiscarded === 'true',
  })
  return { jobs, count: jobs.length }
})

app.patch<{
  Params: { id: string }
  Body: { status: JobStatus }
}>('/jobs/:id/status', async (request, reply) => {
  const status = request.body?.status
  if (status !== 'viewed' && status !== 'applied' && status !== 'discarded') {
    return reply.status(400).send({ error: 'status inválido' })
  }
  const job = await setJobStatus(request.params.id, status)
  if (!job) {
    return reply.status(404).send({ error: 'Vaga não encontrada no banco local' })
  }
  return { job }
})

app.patch<{
  Params: { id: string }
  Body: { applied: boolean }
}>('/jobs/:id/applied', async (request, reply) => {
  const applied = Boolean(request.body?.applied)
  const job = await setJobApplied(request.params.id, applied)
  if (!job) {
    return reply.status(404).send({ error: 'Vaga não encontrada no banco local' })
  }
  return { job }
})

app.delete<{
  Body: { status: 'applied' | 'discarded' }
}>('/jobs', async (request, reply) => {
  const status = request.body?.status
  if (status !== 'applied' && status !== 'discarded') {
    return reply
      .status(400)
      .send({ error: 'Só é possível limpar aplicadas ou descartadas' })
  }
  const removed = await deleteJobsByStatus(status)
  return { ok: true, removed, status }
})

app.get('/monitors', async () => {
  const monitors = await listMonitorStatuses()
  return { monitors }
})

app.post<{
  Body?: {
    name?: string
    search?: SearchParams
    pollingEnabled?: boolean
    intervalMinutes?: number
  }
}>('/monitors', async (request) => {
  const body = request.body ?? {}
  const monitor = await createMonitorRecord({
    name: body.name,
    search: body.search,
    pollingEnabled: body.pollingEnabled,
    intervalMinutes: body.intervalMinutes,
  })
  await syncSchedulers()
  return { monitor: await getMonitorStatus(monitor.id) }
})

app.patch<{
  Params: { id: string }
  Body: {
    name?: string
    search?: SearchParams
    pollingEnabled?: boolean
    intervalMinutes?: number
  }
}>('/monitors/:id', async (request, reply) => {
  const existing = await getMonitor(request.params.id)
  if (!existing) {
    return reply.status(404).send({ error: 'Monitor não encontrado' })
  }

  const body = request.body ?? {}
  const turningOn =
    typeof body.pollingEnabled === 'boolean' &&
    body.pollingEnabled &&
    !existing.pollingEnabled

  if (turningOn) {
    const blocked = await rejectIfNotConfigured(reply)
    if (blocked) return blocked
  }

  await updateMonitor(request.params.id, {
    name: body.name,
    search: body.search,
    pollingEnabled: body.pollingEnabled,
    intervalMinutes: body.intervalMinutes,
  })

  if (turningOn) {
    await setMonitorPolling(
      request.params.id,
      true,
      body.intervalMinutes ?? existing.intervalMinutes,
    )
  } else if (typeof body.pollingEnabled === 'boolean' && !body.pollingEnabled) {
    await setMonitorPolling(request.params.id, false)
  } else {
    await syncSchedulers()
  }

  return { monitor: await getMonitorStatus(request.params.id) }
})

app.delete<{ Params: { id: string } }>('/monitors/:id', async (request, reply) => {
  const ok = await deleteMonitor(request.params.id)
  if (!ok) return reply.status(404).send({ error: 'Monitor não encontrado' })
  await syncSchedulers()
  return { ok: true }
})

app.post<{ Params: { id: string } }>('/monitors/:id/run', async (request, reply) => {
  const blocked = await rejectIfNotConfigured(reply)
  if (blocked) return blocked

  const monitor = await getMonitor(request.params.id)
  if (!monitor) {
    return reply.status(404).send({ error: 'Monitor não encontrado' })
  }
  if (!monitor.search.query?.trim()) {
    return reply.status(400).send({ error: 'Configure a busca do monitor antes' })
  }

  const status = await runMonitorNow(request.params.id)
  if (!status) {
    return reply.status(404).send({ error: 'Monitor não encontrado' })
  }
  if (status.lastError) {
    const isRate =
      /rate|limite|aguarde|intervalo|hora|dia/i.test(status.lastError)
    return reply.status(isRate ? 429 : 502).send({
      error: status.lastError,
      monitor: status,
      rateLimit: searchRateLimiter.snapshot(),
    })
  }
  return { monitor: status }
})

app.post<{ Params: { id: string } }>(
  '/monitors/:id/run/stream',
  async (request, reply) => {
    const blocked = await rejectIfNotConfigured(reply)
    if (blocked) return blocked

    const monitor = await getMonitor(request.params.id)
    if (!monitor) {
      return reply.status(404).send({ error: 'Monitor não encontrado' })
    }
    if (!monitor.search.query?.trim()) {
      return reply.status(400).send({ error: 'Configure a busca do monitor antes' })
    }

    const monitorId = request.params.id
    let clientGone = false

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin':
        request.headers.origin && CORS_ORIGINS.includes(request.headers.origin)
          ? request.headers.origin
          : CORS_ORIGINS[0] || '*',
    })

    const send = (event: string, data: unknown) => {
      if (clientGone) return
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        const flushable = reply.raw as typeof reply.raw & { flush?: () => void }
        flushable.flush?.()
      } catch {
        clientGone = true
      }
    }

    const onClose = () => {
      clientGone = true
      cancelMonitorRun(monitorId)
    }
    request.raw.on('close', onClose)

    const startedAt = Date.now()
    send('progress', {
      phase: 'listing',
      label: 'Iniciando busca…',
      overallPercent: 0,
      listing: { current: 0, total: null },
      descriptions: { current: 0, total: 0 },
      startedAt,
      elapsedMs: 0,
      etaSeconds: null,
    })

    try {
      const status = await runMonitorNow(monitorId, {
        onProgress: (progress) => send('progress', progress),
        onJobs: (jobs) => send('jobs', { jobs }),
      })

      if (!status) {
        send('error', { error: 'Monitor não encontrado' })
        reply.raw.end()
        return
      }

      if (status.lastError && !status.lastRunStats?.cancelled) {
        const isRate =
          /rate|limite|aguarde|intervalo|hora|dia/i.test(status.lastError)
        send('error', {
          error: status.lastError,
          monitor: status,
          rateLimit: searchRateLimiter.snapshot(),
          statusCode: isRate ? 429 : 502,
        })
        reply.raw.end()
        return
      }

      send('done', {
        monitor: status,
        rateLimit: searchRateLimiter.snapshot(),
        cancelled: Boolean(status.lastRunStats?.cancelled),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar'
      send('error', { error: message })
    }

    request.raw.off('close', onClose)
    reply.raw.end()
  },
)

app.post<{ Params: { id: string } }>(
  '/monitors/:id/run/cancel',
  async (request, reply) => {
    const monitor = await getMonitor(request.params.id)
    if (!monitor) {
      return reply.status(404).send({ error: 'Monitor não encontrado' })
    }
    const cancelled = cancelMonitorRun(request.params.id)
    return {
      ok: true,
      cancelled,
      running: isMonitorRunning(request.params.id),
    }
  },
)

app.post<{ Body: SearchParams }>('/search', async (request, reply) => {
  const blocked = await rejectIfNotConfigured(reply)
  if (blocked) return blocked

  const { query, location, postedWithin, fetchDescriptions } = request.body ?? {
    query: '',
  }

  if (!query?.trim()) {
    return reply.status(400).send({ error: 'Campo query é obrigatório' })
  }

  let rateLimit
  try {
    rateLimit = searchRateLimiter.assertAllowed()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rate limit excedido'
    const retryAfterMs =
      err instanceof Error
        ? (err as Error & { retryAfterMs?: number }).retryAfterMs
        : undefined
    if (retryAfterMs) {
      reply.header('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
    }
    return reply.status(429).send({ error: message, rateLimit: searchRateLimiter.snapshot() })
  }

  try {
    const hints = await getJobSearchHints()
    const found = await searchLinkedInJobs(
      {
        query,
        location,
        postedWithin,
        fetchDescriptions: Boolean(fetchDescriptions),
      },
      {
        discardedIds: hints.discardedIds,
        knownDescriptions: hints.knownDescriptions,
      },
    )
    rateLimit = searchRateLimiter.recordSearch()

    const { jobs, newJobs } = await upsertSearchResults(found)
    const withFlags = withNewFlag(
      jobs,
      newJobs.map((j) => j.id),
    )

    return {
      jobs: withFlags,
      count: withFlags.length,
      newCount: newJobs.length,
      rateLimit,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar vagas'
    request.log.error(err)
    return reply.status(502).send({ error: message, rateLimit: searchRateLimiter.snapshot() })
  }
})

try {
  await restoreRateLimitFromDisk()
  await restoreSchedulersFromDisk()
  await app.listen({ port: PORT, host: HOST })
  console.log(`API em http://${HOST}:${PORT}`)
  console.log(`Monitores ativos: ${(await listMonitors()).filter((m) => m.pollingEnabled).length}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
