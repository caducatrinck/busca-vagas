import type { FastifyInstance } from 'fastify'
import type { StoreRepository } from '../../application/ports.js'
import { searchLinkedInJobs } from '../../linkedin.js'
import { searchRateLimiter } from '../../rateLimit.js'
import type { SearchParams } from '../../types.js'

type ReplyLike = {
  status: (code: number) => { send: (body: unknown) => unknown }
  header: (name: string, value: string) => unknown
}

export function registerSearchRoutes(
  app: FastifyInstance,
  deps: {
    repo: StoreRepository
    rejectIfNotConfigured: (reply: ReplyLike) => Promise<unknown>
  },
) {
  const { repo, rejectIfNotConfigured } = deps

  app.post<{ Body: SearchParams }>('/search', async (request, reply) => {
    const blocked = await rejectIfNotConfigured(reply as unknown as ReplyLike)
    if (blocked) return blocked

    const { query, location, postedWithin, fetchDescriptions } =
      request.body ?? { query: '' }

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
      return reply
        .status(429)
        .send({ error: message, rateLimit: searchRateLimiter.snapshot() })
    }

    try {
      const hints = await repo.getJobSearchHints()
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

      const { jobs, newJobs } = await repo.upsertSearchResults(found)
      const withFlags = repo.withNewFlag(
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
      const message =
        err instanceof Error ? err.message : 'Erro ao buscar vagas'
      request.log.error(err)
      return reply
        .status(502)
        .send({ error: message, rateLimit: searchRateLimiter.snapshot() })
    }
  })
}
