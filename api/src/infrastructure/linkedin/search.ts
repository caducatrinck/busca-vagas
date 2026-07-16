import { getScrapeDelayConfig, randomDelay } from '../../rateLimit.js'
import { getAppSettings } from '../../store.js'
import type {
  Job,
  PostedWithin,
  SearchParams,
  SearchProgressCallback,
} from '../../types.js'
import { SearchCancelledError } from '../../types.js'
import { linkedInFetch } from './client.js'
import { parseJobDescriptionHtml, parseJobsFromSearchHtml } from './parser.js'
import { ProgressEmitter } from './progress.js'

export const PAGE_SIZE = 10

export const GEO_IDS: Record<string, string> = {
  brasil: '106057199',
  brazil: '106057199',
  br: '106057199',
  'sao paulo': '100371314',
  remoto: '106057199',
  remote: '106057199',
}

export const POSTED_WITHIN_TO_TPR: Record<PostedWithin, string> = {
  '24h': 'r86400',
  week: 'r604800',
  month: 'r2592000',
}

function throwIfAborted(signal: AbortSignal | undefined, jobs: Job[]) {
  if (signal?.aborted) throw new SearchCancelledError(jobs)
}

export function resolveGeoId(location?: string): string | undefined {
  const key = (location ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
  if (!key) {
    return GEO_IDS.brasil
  }
  return GEO_IDS[key]
}

export function buildSearchPath(params: SearchParams, start: number): string {
  const location = params.location?.trim() ?? ''
  const tpr =
    typeof params.postedWithinSeconds === 'number' &&
    Number.isFinite(params.postedWithinSeconds) &&
    params.postedWithinSeconds > 0
      ? `r${Math.floor(params.postedWithinSeconds)}`
      : POSTED_WITHIN_TO_TPR[params.postedWithin ?? 'week']

  const searchParams = new URLSearchParams({
    keywords: params.query.trim(),
    start: String(start),
    f_TPR: tpr,
    sortBy: 'DD',
  })

  const geoId = resolveGeoId(location)
  if (geoId) {
    searchParams.set('geoId', geoId)
  }
  if (location) {
    searchParams.set('location', location)
  } else {
    searchParams.set('location', 'Brasil')
  }

  return `/jobs-guest/jobs/api/seeMoreJobPostings/search?${searchParams.toString()}`
}

async function fetchJobDescription(
  jobId: string,
  signal?: AbortSignal,
): Promise<string> {
  const html = await linkedInFetch(`/jobs-guest/jobs/api/jobPosting/${jobId}`, signal)
  return parseJobDescriptionHtml(html)
}

export async function enrichDescriptions(
  jobs: Job[],
  query: string,
  knownDescriptions: Map<string, string> = new Map(),
  progress: ProgressEmitter,
  signal?: AbortSignal,
  onJobsBatch?: (jobs: Job[]) => void | Promise<void>,
): Promise<Job[]> {
  const { detailConcurrency } = await getScrapeDelayConfig()

  const withCached = jobs.map((job) => {
    const cached = knownDescriptions.get(job.id)
    if (cached && !job.description?.trim()) {
      return { ...job, description: cached }
    }
    return job
  })

  const tokens = query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)

  const score = (title: string) => {
    if (tokens.length === 0) return 0
    const hay = title
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
    return tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
  }

  const needingFetch = withCached
    .filter((job) => !job.description?.trim())
    .sort((a, b) => score(b.title) - score(a.title))

  const cachedCount = withCached.length - needingFetch.length

  const listingDone = {
    current: jobs.length,
    total: jobs.length,
  }

  progress.markDescriptionsStarted()

  if (needingFetch.length === 0) {
    progress.emit({
      phase: 'descriptions',
      label:
        cachedCount > 0
          ? `Descrições em cache · ${cachedCount}/${jobs.length}`
          : 'Nada a buscar na descrição',
      message:
        cachedCount > 0
          ? 'Nenhuma descrição nova — reaproveitando o banco local'
          : undefined,
      listing: listingDone,
      descriptions: { current: cachedCount, total: cachedCount },
      overallPercent: 96,
    })
    return withCached
  }

  const enrichIds = new Set(needingFetch.map((j) => j.id))
  const enrichedById = new Map<string, Job>()
  let doneCount = 0
  const working = [...withCached]

  progress.emit({
    phase: 'descriptions',
    label: `Buscando descrições 0/${needingFetch.length}`,
    message:
      cachedCount > 0
        ? `${cachedCount} já no banco — só busca as que faltam`
        : undefined,
    listing: listingDone,
    descriptions: { current: 0, total: needingFetch.length },
  })

  for (let i = 0; i < needingFetch.length; i += detailConcurrency) {
    throwIfAborted(signal, working)
    const chunk = needingFetch.slice(i, detailConcurrency + i)
    const results = await Promise.all(
      chunk.map(async (job) => {
        try {
          const description = await fetchJobDescription(job.id, signal)
          return { ...job, description }
        } catch (err) {
          if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
            throw new SearchCancelledError(working)
          }
          return job
        }
      }),
    )
    for (const job of results) {
      enrichedById.set(job.id, job)
      const idx = working.findIndex((j) => j.id === job.id)
      if (idx >= 0) working[idx] = job
    }
    doneCount = Math.min(needingFetch.length, i + chunk.length)
    progress.emit({
      phase: 'descriptions',
      label: `Buscando descrições ${doneCount}/${needingFetch.length}`,
      listing: listingDone,
      descriptions: { current: doneCount, total: needingFetch.length },
    })
    await onJobsBatch?.(results)
    if (i + detailConcurrency < needingFetch.length) {
      await randomDelay(200, 450)
      throwIfAborted(signal, working)
    }
  }

  return withCached.map((job) =>
    enrichIds.has(job.id) ? (enrichedById.get(job.id) ?? job) : job,
  )
}

export type SearchLinkedInOptions = {
  discardedIds?: Set<string>
  knownDescriptions?: Map<string, string>
  onProgress?: SearchProgressCallback

  onJobsBatch?: (jobs: Job[]) => void | Promise<void>

  onListingComplete?: (jobs: Job[]) => void | Promise<void>
  onTelemetry?: (telemetry: {
    linkedinResponded: boolean
    listingRequests: number
    listingPagesWithJobs: number
    emptyReason?: string
  }) => void
  signal?: AbortSignal
}

export async function searchLinkedInJobs(
  params: SearchParams,
  options: SearchLinkedInOptions = {},
): Promise<Job[]> {
  const query = params.query?.trim()
  if (!query) {
    throw new Error('query é obrigatória')
  }

  const discardedIds = options.discardedIds ?? new Set<string>()
  const knownDescriptions = options.knownDescriptions ?? new Map<string, string>()
  const fetchDescriptions = Boolean(params.fetchDescriptions)
  const signal = options.signal
  const progress = new ProgressEmitter(options.onProgress, fetchDescriptions, PAGE_SIZE)

  const jobs: Job[] = []
  const seen = new Set<string>()
  let softTotal: number | null = null
  let listingRequests = 0
  let listingPagesWithJobs = 0
  let emptyReason: string | undefined

  progress.emit({
    phase: 'listing',
    label: 'Buscando vagas 0/…',
    listing: { current: 0, total: null },
    descriptions: { current: 0, total: 0 },
  })

  const { linkedinMaxPages: maxPages } = await getAppSettings()

  try {
    for (let page = 0; page < maxPages; page++) {
      throwIfAborted(signal, jobs)
      const start = page * PAGE_SIZE
      let html: string
      try {
        html = await linkedInFetch(buildSearchPath(params, start), signal)
        listingRequests += 1
      } catch (err) {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
          throw new SearchCancelledError(jobs)
        }
        throw err
      }
      const batch = parseJobsFromSearchHtml(html)

      console.log(
        `[linkedin] listagem · query="${query}" · página=${page + 1} · cards=${batch.length} · bytes=${html.length}`,
      )

      if (batch.length === 0) {
        emptyReason =
          listingRequests > 0
            ? 'LinkedIn respondeu, mas a listagem veio sem cards para essa janela.'
            : undefined
        break
      }
      listingPagesWithJobs += 1

      let newOnPage = 0
      const pageJobs: Job[] = []
      for (const job of batch) {
        if (seen.has(job.id)) continue
        seen.add(job.id)
        newOnPage += 1
        if (discardedIds.has(job.id)) continue
        jobs.push(job)
        pageJobs.push(job)
      }

      if (newOnPage === 0) break

      if (batch.length >= PAGE_SIZE) {
        softTotal = Math.max(softTotal ?? 0, jobs.length + PAGE_SIZE)
      } else {
        softTotal = jobs.length
      }

      progress.emit({
        phase: 'listing',
        label:
          softTotal != null
            ? `Buscando vagas ${jobs.length}/${softTotal}`
            : `Buscando vagas ${jobs.length}`,
        listing: { current: jobs.length, total: softTotal },
        descriptions: { current: 0, total: 0 },
      })

      if (pageJobs.length > 0) {
        await options.onJobsBatch?.(pageJobs)
      }

      if (page < maxPages - 1) {
        await randomDelay(500, 1100)
        throwIfAborted(signal, jobs)
      }
    }

    softTotal = jobs.length
    progress.emit({
      phase: 'listing',
      label: `Buscando vagas ${jobs.length}/${jobs.length}`,
      listing: { current: jobs.length, total: jobs.length },
      descriptions: { current: 0, total: 0 },
      overallPercent: fetchDescriptions ? 48 : 92,
    })

    if (jobs.length === 0) {

      options.onTelemetry?.({
        linkedinResponded: listingRequests > 0,
        listingRequests,
        listingPagesWithJobs,
        emptyReason,
      })
      await options.onListingComplete?.(jobs)
      return jobs
    }

    options.onTelemetry?.({
      linkedinResponded: listingRequests > 0,
      listingRequests,
      listingPagesWithJobs,
      emptyReason,
    })
    await options.onListingComplete?.(jobs)

    if (!fetchDescriptions) {
      return jobs.map((job) => {
        const cached = knownDescriptions.get(job.id)
        return cached && !job.description?.trim()
          ? { ...job, description: cached }
          : job
      })
    }

    return await enrichDescriptions(
      jobs,
      query,
      knownDescriptions,
      progress,
      signal,
      options.onJobsBatch,
    )
  } catch (err) {
    if (err instanceof SearchCancelledError) {
      throw err
    }
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new SearchCancelledError(jobs)
    }
    throw err
  }
}
