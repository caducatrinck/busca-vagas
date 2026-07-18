import type { FastifyInstance } from 'fastify'
import {
  cancelMonitorRun,
  getMonitorStatus,
  isMonitorRunning,
  listMonitorStatuses,
  runMonitorNow,
  setMonitorPolling,
  syncSchedulers,
} from '../../poller.js'
import { searchRateLimiter } from '../../rateLimit.js'
import type { SearchParams } from '../../types.js'
import type { DescriptionFilters } from '../../store.js'
import type { StoreRepository } from '../../application/ports.js'

type ReplyLike = {
  status: (code: number) => { send: (body: unknown) => unknown }
  hijack: () => void
  raw: {
    writeHead: (code: number, headers: Record<string, string>) => void
    write: (chunk: string) => void
    end: () => void
    flush?: () => void
  }
}

export function registerMonitorRoutes(
  app: FastifyInstance,
  deps: {
    repo: StoreRepository
    corsOrigins: string[]
    rejectIfNotConfigured: (reply: ReplyLike) => Promise<unknown>
  },
) {
  const { repo, corsOrigins, rejectIfNotConfigured } = deps

  app.get('/monitors', async () => ({
    monitors: await listMonitorStatuses(),
  }))

  app.post<{
    Body: {
      name?: string
      search?: SearchParams
      pollingEnabled?: boolean
      intervalMinutes?: number
    }
  }>('/monitors', async (request) => {
    const body = request.body ?? {}
    const monitor = await repo.createMonitor({
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
      descriptionFilters?: DescriptionFilters
    }
  }>('/monitors/:id', async (request, reply) => {
    const existing = await repo.getMonitor(request.params.id)
    if (!existing) {
      return reply.status(404).send({ error: 'err:monitor_not_found' })
    }

    const body = request.body ?? {}
    const turningOn =
      typeof body.pollingEnabled === 'boolean' &&
      body.pollingEnabled &&
      !existing.pollingEnabled

    if (turningOn) {
      const blocked = await rejectIfNotConfigured(reply as unknown as ReplyLike)
      if (blocked) return blocked
    }

    await repo.updateMonitor(request.params.id, {
      name: body.name,
      search: body.search,
      pollingEnabled: body.pollingEnabled,
      intervalMinutes: body.intervalMinutes,
      descriptionFilters: body.descriptionFilters,
    })

    if (turningOn) {
      await setMonitorPolling(
        request.params.id,
        true,
        body.intervalMinutes ?? existing.intervalMinutes,
      )
    } else if (
      typeof body.pollingEnabled === 'boolean' &&
      !body.pollingEnabled
    ) {
      await setMonitorPolling(request.params.id, false)
    } else {
      await syncSchedulers()
    }

    return { monitor: await getMonitorStatus(request.params.id) }
  })

  app.delete<{ Params: { id: string } }>(
    '/monitors/:id',
    async (request, reply) => {
      const ok = await repo.deleteMonitor(request.params.id)
      if (!ok) return reply.status(404).send({ error: 'err:monitor_not_found' })
      await syncSchedulers()
      return { ok: true }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/monitors/:id/run',
    async (request, reply) => {
      const blocked = await rejectIfNotConfigured(reply as unknown as ReplyLike)
      if (blocked) return blocked

      const monitor = await repo.getMonitor(request.params.id)
      if (!monitor) {
        return reply.status(404).send({ error: 'err:monitor_not_found' })
      }
      if (!monitor.search.query?.trim()) {
        return reply
          .status(400)
          .send({ error: 'err:monitor_search_required' })
      }

      const status = await runMonitorNow(request.params.id)
      if (!status) {
        return reply.status(404).send({ error: 'err:monitor_not_found' })
      }
      if (status.lastError) {
        const isRate =
          /rate|limite|aguarde|pausa|intervalo|hora|dia|proteção local|err:cooldown|err:local_cap|err:linkedin_|err:rate_/i.test(status.lastError)
        return reply.status(isRate ? 429 : 502).send({
          error: status.lastError,
          monitor: status,
          rateLimit: searchRateLimiter.snapshot(),
        })
      }
      return { monitor: status }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/monitors/:id/run/stream',
    async (request, reply) => {
      const blocked = await rejectIfNotConfigured(reply as unknown as ReplyLike)
      if (blocked) return blocked

      const monitor = await repo.getMonitor(request.params.id)
      if (!monitor) {
        return reply.status(404).send({ error: 'err:monitor_not_found' })
      }
      if (!monitor.search.query?.trim()) {
        return reply
          .status(400)
          .send({ error: 'err:monitor_search_required' })
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
          request.headers.origin &&
          corsOrigins.includes(request.headers.origin)
            ? request.headers.origin
            : corsOrigins[0] || '*',
      })

      const send = (event: string, data: unknown) => {
        if (clientGone) return
        try {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          const flushable = reply.raw as typeof reply.raw & {
            flush?: () => void
          }
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
          send('error', { error: 'err:monitor_not_found' })
          reply.raw.end()
          return
        }

        if (status.lastError && !status.lastRunStats?.cancelled) {
          const isRate =
            /rate|limite|aguarde|pausa|intervalo|hora|dia|proteção local|err:cooldown|err:local_cap|err:linkedin_|err:rate_/i.test(status.lastError)
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
      const monitor = await repo.getMonitor(request.params.id)
      if (!monitor) {
        return reply.status(404).send({ error: 'err:monitor_not_found' })
      }
      const cancelled = cancelMonitorRun(request.params.id)
      return {
        ok: true,
        cancelled,
        running: isMonitorRunning(request.params.id),
      }
    },
  )
}
