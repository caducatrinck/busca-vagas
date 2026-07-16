import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import { getScrapeDelayConfig, randomDelay } from './rateLimit.js'
import { getAppSettings } from './store.js'
import type {
  Job,
  PostedWithin,
  SearchParams,
  SearchProgress,
  SearchProgressCallback,
} from './types.js'
import { SearchCancelledError } from './types.js'

const LINKEDIN_BASE = 'https://www.linkedin.com'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const PAGE_SIZE = 10

const GEO_IDS: Record<string, string> = {
  brasil: '106057199',
  brazil: '106057199',
  br: '106057199',
  'sao paulo': '100371314',
  remoto: '106057199',
  remote: '106057199',
}

const POSTED_WITHIN_TO_TPR: Record<PostedWithin, string> = {
  '24h': 'r86400',
  week: 'r604800',
  month: 'r2592000',
}

async function buildCookieHeader(): Promise<string | undefined> {
  const settings = await getAppSettings()
  const liAt = settings.linkedinLiAt.trim()
  const jsessionid = settings.linkedinJsessionId.trim()

  const parts: string[] = []
  if (liAt) parts.push(`li_at=${liAt}`)
  if (jsessionid) {
    const value = jsessionid.replace(/^"|"$/g, '')
    parts.push(`JSESSIONID="${value}"`)
  }

  return parts.length > 0 ? parts.join('; ') : undefined
}

function formatNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return 'Falha de rede ao contatar o LinkedIn'
  const cause = (err as Error & { cause?: unknown }).cause
  const causeObj =
    cause && typeof cause === 'object'
      ? (cause as { code?: string; message?: string })
      : null
  const detail =
    causeObj?.code ||
    causeObj?.message ||
    (typeof cause === 'string' ? cause : null)
  if (err.message === 'fetch failed' || err.name === 'TypeError') {
    return detail
      ? `Falha de rede ao contatar o LinkedIn (${detail}). Tente de novo em alguns segundos.`
      : 'Falha de rede ao contatar o LinkedIn. Tente de novo em alguns segundos.'
  }
  return detail ? `${err.message} (${detail})` : err.message
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError') return false
  if (err.message === 'fetch failed' || err.name === 'TypeError') return true
  const code = (err as Error & { cause?: { code?: string } }).cause?.code
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET'
  )
}

function mergeAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const list = signals.filter((s): s is AbortSignal => Boolean(s))
  if (list.length === 0) return undefined
  if (list.length === 1) return list[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list)
  const ac = new AbortController()
  for (const s of list) {
    if (s.aborted) {
      ac.abort()
      return ac.signal
    }
    s.addEventListener('abort', () => ac.abort(), { once: true })
  }
  return ac.signal
}

const FETCH_TIMEOUT_MS = 25_000

function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get('retry-after')
  if (!raw) return undefined
  const asInt = Number(raw)
  if (Number.isFinite(asInt) && asInt >= 0) return Math.ceil(asInt * 1000)
  const asDate = Date.parse(raw)
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now())
  return undefined
}

function linkedInRateHeaders(res: Response): string {
  const interesting = [
    'retry-after',
    'x-li-uuid',
    'x-restli-protocol-version',
    'x-li-fabric',
    'cf-ray',
  ]
  const parts: string[] = []
  for (const name of interesting) {
    const value = res.headers.get(name)
    if (value) parts.push(`${name}=${value}`)
  }
  return parts.length > 0 ? ` · headers: ${parts.join(', ')}` : ''
}

function throwLinkedInHttpError(res: Response): never {
  const retryAfterMs = parseRetryAfterMs(res)
  const headersHint = linkedInRateHeaders(res)
  let message: string
  if (res.status === 429) {
    const wait = retryAfterMs
      ? ` Retry-After ~${Math.ceil(retryAfterMs / 1000)}s.`
      : ''
    message = `LinkedIn rate limit (HTTP 429).${wait}${headersHint}`
  } else if (res.status === 401 || res.status === 403) {
    message = `LinkedIn bloqueou a requisição (HTTP ${res.status}). Atualize o cookie li_at ou aguarde.${headersHint}`
  } else if (res.status === 999) {
    message = `LinkedIn respondeu HTTP 999 (anti-bot / bloqueio).${headersHint}`
  } else {
    message = `LinkedIn respondeu HTTP ${res.status}.${headersHint}`
  }
  const err = new Error(message)
  if (retryAfterMs != null) {
    ;(err as Error & { retryAfterMs?: number }).retryAfterMs = retryAfterMs
  }
  ;(err as Error & { linkedInStatus?: number }).linkedInStatus = res.status
  throw err
}

async function linkedInFetch(path: string, signal?: AbortSignal): Promise<string> {
  const cookie = await buildCookieHeader()
  const url = `${LINKEDIN_BASE}${path}`
  const maxAttempts = 3
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfAborted(signal, [])
    const timeout =
      typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
        : undefined
    const combined = mergeAbortSignals(signal, timeout)
    try {
      const res = await fetch(url, {
        signal: combined,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      })

      if (!res.ok) {
        if (res.status === 429 && attempt < maxAttempts) {
          const wait = parseRetryAfterMs(res) ?? 1500 * attempt
          console.warn(
            `[linkedin] HTTP 429 · tentativa ${attempt}/${maxAttempts} · aguardando ${Math.ceil(wait / 1000)}s`,
          )
          await randomDelay(wait, wait + 500)
          continue
        }
        throwLinkedInHttpError(res)
      }

      return res.text()
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {

        if (
          !signal?.aborted &&
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError')
        ) {
          lastErr = new Error(
            `LinkedIn não respondeu a tempo (${FETCH_TIMEOUT_MS / 1000}s).`,
          )
          if (attempt === maxAttempts) throw lastErr
          await randomDelay(400 * attempt, 900 * attempt)
          continue
        }
        throw err
      }

      if (
        err instanceof Error &&
        (err.message.startsWith('LinkedIn bloqueou') ||
          err.message.startsWith('LinkedIn rate limit') ||
          err.message.startsWith('LinkedIn respondeu') ||
          err.message.startsWith('LinkedIn não respondeu'))
      ) {
        throw err
      }
      lastErr = err
      if (!isRetryableNetworkError(err) || attempt === maxAttempts) {
        throw new Error(formatNetworkError(err))
      }
      await randomDelay(400 * attempt, 900 * attempt)
    }
  }

  throw new Error(formatNetworkError(lastErr))
}

function resolveGeoId(location?: string): string | undefined {
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

function buildSearchPath(params: SearchParams, start: number): string {
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

function parseJobId(card: cheerio.Cheerio<Element>, href: string): string {
  const urn = card.attr('data-entity-urn') || ''
  const fromUrn = urn.match(/jobPosting:(\d+)/)?.[1]
  if (fromUrn) return fromUrn

  const fromHref =
    href.match(/\/jobs\/view\/[^/]+-(\d+)/)?.[1] ||
    href.match(/currentJobId=(\d+)/)?.[1]
  return fromHref || href
}

function parseJobsFromSearchHtml(html: string): Job[] {
  const $ = cheerio.load(html)
  const jobs: Job[] = []
  const seen = new Set<string>()

  $('div.base-search-card, li').each((_: number, el) => {
    const card = $(el)
    if (!card.attr('data-entity-urn')?.includes('jobPosting')) return

    const link = card.find('a.base-card__full-link').first()
    let href = link.attr('href') || ''
    if (href.startsWith('/')) href = `${LINKEDIN_BASE}${href}`

    const title = card.find('.base-search-card__title').first().text().replace(/\s+/g, ' ').trim()
    const company = card
      .find('.base-search-card__subtitle')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    const location = card
      .find('.job-search-card__location')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    const postedAt =
      card.find('time').first().attr('datetime') ||
      card.find('time').first().text().trim() ||
      undefined

    const id = parseJobId(card, href)
    if (!title || seen.has(id)) return
    seen.add(id)

    jobs.push({
      id,
      title,
      company,
      location,
      description: '',
      url: href.split('?')[0] || href,
      postedAt,
    })
  })

  return jobs
}

async function fetchJobDescription(
  jobId: string,
  signal?: AbortSignal,
): Promise<string> {
  const html = await linkedInFetch(`/jobs-guest/jobs/api/jobPosting/${jobId}`, signal)
  const $ = cheerio.load(html)
  const text =
    $('.show-more-less-html__markup').first().text() ||
    $('.description__text').first().text() ||
    $('.decorated-job-posting__details').first().text()

  return text.replace(/\s+/g, ' ').trim()
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function throwIfAborted(signal: AbortSignal | undefined, jobs: Job[]) {
  if (signal?.aborted) throw new SearchCancelledError(jobs)
}

class ProgressEmitter {
  readonly startedAt = Date.now()
  private descriptionsStartedAt: number | null = null
  private last: SearchProgress | null = null

  constructor(
    private onProgress: SearchProgressCallback | undefined,
    private fetchDescriptions: boolean,
  ) {}

  markDescriptionsStarted() {
    this.descriptionsStartedAt = Date.now()
  }

  private etaSeconds(
    phase: SearchProgress['phase'],
    listing: SearchProgress['listing'],
    descriptions: SearchProgress['descriptions'],
  ): number | null {
    const elapsed = Date.now() - this.startedAt
    if (elapsed < 1200) return null

    if (phase === 'listing') {
      const { current, total } = listing
      if (current < 4) return null
      const msPerJob = elapsed / current
      const remainingListing =
        total != null
          ? Math.max(0, total - current) * msPerJob
          : Math.max(PAGE_SIZE, current * 0.25) * msPerJob
      const descExtra = this.fetchDescriptions
        ? (total ?? Math.ceil(current * 1.15)) * 380
        : 0
      return Math.max(1, Math.ceil((remainingListing + descExtra) / 1000))
    }

    if (phase === 'descriptions') {
      const { current, total } = descriptions
      if (current < 2 || total <= 0) return null
      const descElapsed = Date.now() - (this.descriptionsStartedAt ?? this.startedAt)
      const msPer = descElapsed / Math.max(current, 1)
      return Math.max(1, Math.ceil(((total - current) * msPer) / 1000))
    }

    if (phase === 'saving') return 1
    return 0
  }

  emit(
    patch: Omit<
      SearchProgress,
      'overallPercent' | 'startedAt' | 'elapsedMs' | 'etaSeconds'
    > & { overallPercent?: number },
  ) {
    if (!this.onProgress) return

    const listing = patch.listing
    const descriptions = patch.descriptions
    let overall = patch.overallPercent

    if (overall == null) {
      if (patch.phase === 'done') {
        overall = 100
      } else if (patch.phase === 'error') {
        overall = 0
      } else if (patch.phase === 'saving') {
        overall = this.fetchDescriptions ? 97 : 95
      } else if (patch.phase === 'descriptions') {
        const descRatio =
          descriptions.total > 0 ? descriptions.current / descriptions.total : 1
        overall = 48 + descRatio * 48
      } else {
        const total = listing.total
        if (total != null && total > 0) {
          const ratio = Math.min(1, listing.current / total)
          overall = ratio * (this.fetchDescriptions ? 48 : 92)
        } else {
          const soft = 1 - Math.exp(-(listing.current || 1) / 90)
          overall = soft * (this.fetchDescriptions ? 42 : 85)
        }
      }
    }

    const progress: SearchProgress = {
      phase: patch.phase,
      label: patch.label,
      message: patch.message,
      listing,
      descriptions,
      overallPercent: clampPercent(overall),
      startedAt: this.startedAt,
      elapsedMs: Date.now() - this.startedAt,
      etaSeconds: this.etaSeconds(patch.phase, listing, descriptions),
      cancelled: patch.cancelled,
    }
    this.last = progress
    this.onProgress(progress)
  }

  snapshot(): SearchProgress | null {
    return this.last
  }
}

async function enrichDescriptions(
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
  const progress = new ProgressEmitter(options.onProgress, fetchDescriptions)

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
