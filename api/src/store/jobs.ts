import type { Job } from '../types.js'
import type { JobStatus, StoredJob } from './types.js'
import { normalizeJob, resolveStatus } from './defaults.js'
import { ensureStore, persist } from './persistence.js'

export async function getJobSearchHints(): Promise<{
  discardedIds: Set<string>
  knownDescriptions: Map<string, string>
  knownWorkplaceTypes: Map<string, Job['workplaceType']>
}> {
  const store = await ensureStore()
  const discardedIds = new Set<string>()
  const knownDescriptions = new Map<string, string>()
  const knownWorkplaceTypes = new Map<string, Job['workplaceType']>()

  for (const job of Object.values(store.jobs)) {
    const normalized = normalizeJob(job)
    if (normalized.status === 'discarded') {
      discardedIds.add(normalized.id)
    }

    const description = normalized.description?.trim()
    if (description) {
      knownDescriptions.set(normalized.id, description)
    }
    if (normalized.workplaceType) {
      knownWorkplaceTypes.set(normalized.id, normalized.workplaceType)
    }
  }

  return { discardedIds, knownDescriptions, knownWorkplaceTypes }
}

export async function listJobs(options?: {
  status?: JobStatus
  appliedOnly?: boolean
  monitorId?: string
  excludeDiscarded?: boolean
}): Promise<StoredJob[]> {
  const store = await ensureStore()
  let jobs = Object.values(store.jobs).map(normalizeJob)

  if (options?.status) {
    jobs = jobs.filter((j) => j.status === options.status)
  } else if (options?.appliedOnly) {
    jobs = jobs.filter((j) => j.status === 'applied')
  }
  if (options?.excludeDiscarded) {
    jobs = jobs.filter((j) => j.status !== 'discarded')
  }
  if (options?.monitorId) {
    jobs = jobs.filter((j) => j.monitorIds.includes(options.monitorId!))
  }

  jobs.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  return jobs
}

/** Prefere ISO com horário a data só-dia; atualiza quando a nova coleta traz mais precisão. */
function preferPostedAt(
  incoming?: string,
  existing?: string,
): string | undefined {
  const next = incoming?.trim()
  const prev = existing?.trim()
  if (!next) return prev
  if (!prev) return next
  const nextPrecise = next.includes('T')
  const prevPrecise = prev.includes('T')
  if (nextPrecise) return next
  if (prevPrecise && !nextPrecise) return prev
  return next
}

export type UpsertSearchOptions = {
  /** Se true, grava a vaga como discarded (não sobrescreve applied). */
  shouldDiscard?: (job: Job) => boolean
}

export async function upsertSearchResults(
  jobs: Job[],
  monitorId?: string,
  options: UpsertSearchOptions = {},
): Promise<{
  jobs: StoredJob[]
  newJobs: StoredJob[]
}> {
  const store = await ensureStore()
  const now = new Date().toISOString()
  const newJobs: StoredJob[] = []
  const result: StoredJob[] = []

  for (const job of jobs) {
    const existing = store.jobs[job.id]
    const autoDiscard = Boolean(options.shouldDiscard?.(job))

    if (existing) {
      const monitorIds = new Set(existing.monitorIds)
      if (monitorId) monitorIds.add(monitorId)
      let status = resolveStatus(existing)
      if (autoDiscard && status !== 'applied') {
        status = 'discarded'
      }
      const merged: StoredJob = {
        ...existing,
        ...job,
        description: job.description || existing.description,
        workplaceType:
          job.workplaceType !== undefined
            ? job.workplaceType
            : existing.workplaceType,
        workplaceResolved:
          job.workplaceResolved || existing.workplaceResolved,
        postedAt: preferPostedAt(job.postedAt, existing.postedAt),
        postedLabel: job.postedLabel?.trim() || existing.postedLabel,
        status,
        applied: status === 'applied',
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: now,
        monitorIds: [...monitorIds],
      }
      store.jobs[job.id] = normalizeJob(merged)
      result.push(store.jobs[job.id])
    } else {
      const status: JobStatus = autoDiscard ? 'discarded' : 'viewed'
      const created = normalizeJob({
        ...job,
        status,
        applied: false,
        firstSeenAt: now,
        lastSeenAt: now,
        monitorIds: monitorId ? [monitorId] : [],
      })
      store.jobs[job.id] = created
      newJobs.push(created)
      result.push(created)
    }
  }

  await persist(store)
  return { jobs: result, newJobs }
}

export async function setJobStatus(
  id: string,
  status: JobStatus,
): Promise<StoredJob | null> {
  const store = await ensureStore()
  const job = store.jobs[id]
  if (!job) return null
  job.status = status
  job.applied = status === 'applied'
  job.lastSeenAt = new Date().toISOString()
  store.jobs[id] = normalizeJob(job)
  await persist(store)
  return store.jobs[id]
}

export async function setJobApplied(
  id: string,
  applied: boolean,
): Promise<StoredJob | null> {
  return setJobStatus(id, applied ? 'applied' : 'viewed')
}

export async function deleteJobsByStatus(
  status: Extract<JobStatus, 'applied' | 'discarded'>,
): Promise<number> {
  const store = await ensureStore()
  let removed = 0
  for (const [id, job] of Object.entries(store.jobs)) {
    if (resolveStatus(job) === status) {
      delete store.jobs[id]
      removed += 1
    }
  }
  if (removed > 0) await persist(store)
  return removed
}

/** Apaga todas as vagas salvas (pendentes, aplicadas e descartadas). */
export async function deleteAllJobs(): Promise<number> {
  const store = await ensureStore()
  const removed = Object.keys(store.jobs).length
  if (removed === 0) return 0
  store.jobs = {}
  await persist(store)
  return removed
}

export function withNewFlag(
  jobs: StoredJob[],
  newIds: Iterable<string>,
): Array<StoredJob & { isNew: boolean }> {
  const set = new Set(newIds)
  return jobs.map((job) => ({
    ...job,
    isNew: set.has(job.id),
  }))
}
