import { getScrapeDelayConfig, randomDelay } from '../../rateLimit.js'
import { log } from '../../logger.js'
import { getAppSettings } from '../../store.js'
import type {
  Job,
  PostedWithin,
  SearchParams,
  SearchProgressCallback,
} from '../../types.js'
import { SearchCancelledError } from '../../types.js'
import { linkedInFetch, linkedInVoyagerFetch, isVoyagerAuthBlocked } from './client.js'
import {
  parseDescriptionFromVoyagerPayload,
  parseJobDetailHtml,
  parseJobsFromSearchHtml,
  parseWorkplaceFromVoyagerPayload,
} from './parser.js'
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
  '30m': 'r1800',
  '1h': 'r3600',
  '10h': 'r36000',
  '24h': 'r86400',
  '3d': 'r259200',
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
      : POSTED_WITHIN_TO_TPR[params.postedWithin ?? '3d'] ??
        POSTED_WITHIN_TO_TPR['3d']

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

async function fetchJobDetail(
  jobId: string,
  signal?: AbortSignal,
): Promise<{
  description: string
  workplaceType?: Job['workplaceType']
  workplaceResolved: boolean
}> {
  // Tags Híbrido/Presencial/Remoto só vêm no Voyager autenticado (HTML guest não traz).
  if (!isVoyagerAuthBlocked()) {
    try {
      const payload = await linkedInVoyagerFetch(
        `/voyager/api/jobs/jobPostings/${jobId}`,
        signal,
      )
      return {
        description: parseDescriptionFromVoyagerPayload(payload),
        workplaceType: parseWorkplaceFromVoyagerPayload(payload) ?? null,
        workplaceResolved: true,
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw err
      }
      console.warn(
        `[linkedin] Voyager falhou para ${jobId} · fallback guest · ${
          err instanceof Error ? err.message : err
        }`,
      )
    }
  }

  const html = await linkedInFetch(
    `/jobs-guest/jobs/api/jobPosting/${jobId}`,
    signal,
  )
  const detail = parseJobDetailHtml(html)
  return {
    description: detail.description,
    workplaceType: detail.workplaceType,
    workplaceResolved: false,
  }
}

export async function enrichDescriptions(
  jobs: Job[],
  query: string,
  knownDescriptions: Map<string, string> = new Map(),
  progress: ProgressEmitter,
  signal?: AbortSignal,
  onJobsBatch?: (jobs: Job[]) => void | Promise<void>,
  knownWorkplaceTypes: Map<string, Job['workplaceType']> = new Map(),
  fetchDescriptions = true,
): Promise<Job[]> {
  const { detailConcurrency } = await getScrapeDelayConfig()

  const withCached = jobs.map((job) => {
    const cachedDesc = knownDescriptions.get(job.id)
    let next = job
    if (fetchDescriptions && cachedDesc && !job.description?.trim()) {
      next = { ...next, description: cachedDesc }
    }
    if (
      !next.workplaceType &&
      next.workplaceResolved !== true &&
      knownWorkplaceTypes.has(job.id)
    ) {
      const known = knownWorkplaceTypes.get(job.id)
      if (known) next = { ...next, workplaceType: known, workplaceResolved: true }
    }
    return next
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
    .filter((job) => {
      const needDesc = fetchDescriptions && !job.description?.trim()
      // null antigo sem Voyager deve ser reconsultado
      const needWorkplace =
        !job.workplaceType && job.workplaceResolved !== true
      return needDesc || needWorkplace
    })
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
          ? `Detalhes em cache · ${cachedCount}/${jobs.length}`
          : 'Nada a buscar nos detalhes',
      message:
        cachedCount > 0
          ? 'Reaproveitando tags e descrições do banco local'
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
    label: `Buscando detalhes 0/${needingFetch.length}`,
    message:
      cachedCount > 0
        ? `${cachedCount} já no banco — só busca o que falta`
        : 'Tags de modelo de trabalho (híbrido/presencial/remoto)',
    listing: listingDone,
    descriptions: { current: 0, total: needingFetch.length },
  })

  for (let i = 0; i < needingFetch.length; i += detailConcurrency) {
    throwIfAborted(signal, working)
    const chunk = needingFetch.slice(i, detailConcurrency + i)
    const results = await Promise.all(
      chunk.map(async (job) => {
        try {
          const detail = await fetchJobDetail(job.id, signal)
          return {
            ...job,
            description: fetchDescriptions
              ? detail.description || job.description
              : job.description,
            workplaceType: detail.workplaceResolved
              ? detail.workplaceType ?? null
              : detail.workplaceType ?? job.workplaceType,
            workplaceResolved:
              detail.workplaceResolved || Boolean(job.workplaceResolved),
          }
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
      label: `Buscando detalhes ${doneCount}/${needingFetch.length}`,
      listing: listingDone,
      descriptions: { current: doneCount, total: needingFetch.length },
    })
    await onJobsBatch?.(results)
    if (i + detailConcurrency < needingFetch.length) {
      // 1–2s entre lotes: Voyager 403/429 sobe muito com rajada.
      await randomDelay(1000, 2000)
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
  knownWorkplaceTypes?: Map<string, Job['workplaceType']>
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
  const knownWorkplaceTypes =
    options.knownWorkplaceTypes ?? new Map<string, Job['workplaceType']>()
  const fetchDescriptions = Boolean(params.fetchDescriptions)
  const signal = options.signal
  const progress = new ProgressEmitter(options.onProgress, true, PAGE_SIZE)

  const jobs: Job[] = []
  const seen = new Set<string>()
  let softTotal: number | null = null
  let listingRequests = 0
  let listingPagesWithJobs = 0
  let emptyReason: string | undefined
  let duplicatePageStreak = 0
  // Guest sem cookie às vezes repete páginas; tolera um pouco mais antes de parar.
  const MAX_DUPLICATE_PAGES = 6

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
        // 502/503/rede no meio da listagem: mantém o que já veio.
        const msg = err instanceof Error ? err.message : String(err)
        if (
          jobs.length > 0 &&
          (/err:http:(502|503)/.test(msg) || /err:network_linkedin/.test(msg))
        ) {
          log.warn('linkedin.listing.partial_stop', {
            page: page + 1,
            jobs: jobs.length,
            error: msg,
          })
          break
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

      if (newOnPage === 0) {
        duplicatePageStreak += 1
        if (batch.length < PAGE_SIZE || duplicatePageStreak >= MAX_DUPLICATE_PAGES) {
          break
        }
      } else {
        duplicatePageStreak = 0
      }

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
        await randomDelay(1000, 2000)
        throwIfAborted(signal, jobs)
      }
    }

    softTotal = jobs.length
    progress.emit({
      phase: 'listing',
      label: `Buscando vagas ${jobs.length}/${jobs.length}`,
      listing: { current: jobs.length, total: jobs.length },
      descriptions: { current: 0, total: 0 },
      overallPercent: 48,
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

    return await enrichDescriptions(
      jobs,
      query,
      knownDescriptions,
      progress,
      signal,
      options.onJobsBatch,
      knownWorkplaceTypes,
      fetchDescriptions,
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
