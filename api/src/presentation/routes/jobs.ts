import type { FastifyInstance } from 'fastify'
import type { StoreRepository } from '../../application/ports.js'
import type { JobStatus } from '../../store.js'

export function registerJobRoutes(
  app: FastifyInstance,
  deps: { repo: StoreRepository },
) {
  const { repo } = deps

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
    const jobs = await repo.listJobs({
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
      return reply.status(400).send({ error: 'err:invalid_status' })
    }
    const job = await repo.setJobStatus(request.params.id, status)
    if (!job) {
      return reply
        .status(404)
        .send({ error: 'err:job_not_found' })
    }
    return { job }
  })

  app.patch<{
    Params: { id: string }
    Body: { applied: boolean }
  }>('/jobs/:id/applied', async (request, reply) => {
    const applied = Boolean(request.body?.applied)
    const job = await repo.setJobApplied(request.params.id, applied)
    if (!job) {
      return reply
        .status(404)
        .send({ error: 'err:job_not_found' })
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
        .send({ error: 'err:clear_status_invalid' })
    }
    const removed = await repo.deleteJobsByStatus(status)
    return { ok: true, removed, status }
  })
}
