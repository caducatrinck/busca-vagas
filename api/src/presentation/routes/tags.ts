import type { FastifyInstance } from 'fastify'
import type { StoreRepository } from '../../application/ports.js'

export function registerTagRoutes(
  app: FastifyInstance,
  deps: { repo: StoreRepository },
) {
  const { repo } = deps

  app.get('/tags', async () => ({
    tags: await repo.listTags(),
  }))

  app.post<{ Body: { label?: string } }>('/tags', async (request, reply) => {
    const label = request.body?.label ?? ''
    try {
      const tag = await repo.createTag(label)
      return { tag, tags: await repo.listTags() }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'err:tag_create'
      const status =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode) || 400
          : 400
      return reply.status(status).send({ error: message })
    }
  })

  app.delete<{ Params: { id: string } }>(
    '/tags/:id',
    async (request, reply) => {
      try {
        const ok = await repo.deleteTag(request.params.id)
        if (!ok) return reply.status(404).send({ error: 'err:tag_not_found' })
        return { ok: true, tags: await repo.listTags() }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'err:tag_delete'
        const status =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode) || 400
            : 400
        return reply.status(status).send({ error: message })
      }
    },
  )
}
