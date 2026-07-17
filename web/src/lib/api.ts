import type {
  Job,
  JobFilters,
  JobStatus,
  Monitor,
  SearchForm,
  SearchProgress,
  SearchRunStats,
  DescriptionFilters,
} from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8787'

export type RateLimitInfo = {
  allowed: boolean
  reason?: string
  retryAfterMs?: number
  source?: 'linkedin' | 'cooldown' | 'local-cap' | null
  limits: {
    minIntervalMs: number
    maxPerHour: number
    maxPerDay: number
  }
  usage: {
    searchesThisHour: number
    searchesToday: number
    remainingThisHour: number | null
    remainingToday: number | null
    nextAllowedAt: number | null
    blockedUntil?: number | null
    lastLinkedInStatus?: number | null
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

function parseSseChunk(
  chunk: string,
): { event: string; data: string } | null {
  const lines = chunk.split('\n')
  let event = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

export async function fetchRateLimit(): Promise<RateLimitInfo | null> {
  try {
    const res = await fetch(`${API_URL}/rate-limit`)
    if (!res.ok) return null
    return parseJson<RateLimitInfo>(res)
  } catch {
    return null
  }
}

export type PublicAppSettings = {
  ready: boolean
  linkedinLiAtSet: boolean
  linkedinLiAtHint: string
  linkedinJsessionIdSet: boolean
  linkedinMaxPages: number
  searchCooldownMs: number
  maxSearchesPerHour: number
  maxSearchesPerDay: number
  jobDetailConcurrency: number
}

export type SettingsPatch = {
  linkedinLiAt?: string
  linkedinJsessionId?: string
  clearLinkedinLiAt?: boolean
  clearLinkedinJsessionId?: boolean
  linkedinMaxPages?: number
  searchCooldownMs?: number
  maxSearchesPerHour?: number
  maxSearchesPerDay?: number
  jobDetailConcurrency?: number
}

export async function fetchSettings(): Promise<PublicAppSettings> {
  const res = await fetch(`${API_URL}/settings`)
  const data = await parseJson<PublicAppSettings & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error || 'Falha ao carregar configurações')
  return data
}

export async function saveSettings(
  patch: SettingsPatch,
): Promise<PublicAppSettings> {
  const res = await fetch(`${API_URL}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = await parseJson<PublicAppSettings & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error || 'Falha ao salvar configurações')
  return data
}

export async function searchJobs(form: SearchForm): Promise<{
  jobs: Job[]
  newCount: number
}> {
  const res = await fetch(`${API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: form.query,
      location: form.location || undefined,
      postedWithin: form.postedWithin,
      fetchDescriptions: form.fetchDescriptions,
    }),
  })

  const data = await parseJson<{
    jobs?: Job[]
    newCount?: number
    error?: string
    rateLimit?: RateLimitInfo
  }>(res)

  if (!res.ok) {
    const extra = data.rateLimit?.reason ? ` ${data.rateLimit.reason}` : ''
    throw new Error((data.error || `Erro HTTP ${res.status}`) + extra)
  }

  return {
    jobs: data.jobs ?? [],
    newCount: data.newCount ?? 0,
  }
}

export async function fetchSavedJobs(options?: {
  status?: JobStatus
  appliedOnly?: boolean
  monitorId?: string
  excludeDiscarded?: boolean
}): Promise<Job[]> {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)
  if (options?.appliedOnly) params.set('applied', 'true')
  if (options?.monitorId) params.set('monitorId', options.monitorId)
  if (options?.excludeDiscarded) params.set('excludeDiscarded', 'true')
  const qs = params.toString()
  const res = await fetch(`${API_URL}/jobs${qs ? `?${qs}` : ''}`)
  const data = await parseJson<{ jobs?: Job[]; error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return Array.isArray(data.jobs) ? data.jobs : []
}

export async function setJobStatus(id: string, status: JobStatus): Promise<Job> {
  const res = await fetch(`${API_URL}/jobs/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const data = await parseJson<{ job?: Job; error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  if (!data.job) throw new Error('Resposta inválida')
  return data.job
}

export async function setJobApplied(id: string, applied: boolean): Promise<Job> {
  return setJobStatus(id, applied ? 'applied' : 'viewed')
}

export async function clearJobsByStatus(
  status: 'applied' | 'discarded',
): Promise<number> {
  const res = await fetch(`${API_URL}/jobs`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const data = await parseJson<{ removed?: number; error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return data.removed ?? 0
}

export async function fetchMonitors(): Promise<Monitor[]> {
  const res = await fetch(`${API_URL}/monitors`)
  const data = await parseJson<{ monitors?: Monitor[]; error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return Array.isArray(data.monitors) ? data.monitors : []
}

export async function createMonitor(input?: {
  name?: string
  search?: SearchForm
}): Promise<Monitor> {
  const res = await fetch(`${API_URL}/monitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  })
  const data = await parseJson<{ monitor?: Monitor; error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  if (!data.monitor) throw new Error('Resposta inválida')
  return data.monitor
}

export async function updateMonitor(
  id: string,
  patch: {
    name?: string
    search?: SearchForm
    pollingEnabled?: boolean
    intervalMinutes?: number
    descriptionFilters?: DescriptionFilters
  },
): Promise<Monitor> {
  const res = await fetch(`${API_URL}/monitors/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = await parseJson<{ monitor?: Monitor; error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  if (!data.monitor) throw new Error('Resposta inválida')
  return data.monitor
}

export async function removeMonitor(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/monitors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await parseJson<{ error?: string }>(res)
    throw new Error(data.error || `Erro HTTP ${res.status}`)
  }
}

export async function runMonitor(id: string): Promise<Monitor> {
  const res = await fetch(`${API_URL}/monitors/${encodeURIComponent(id)}/run`, {
    method: 'POST',
  })
  const data = await parseJson<{ monitor?: Monitor; error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  if (!data.monitor) throw new Error('Resposta inválida')
  return data.monitor
}

export async function cancelMonitorRun(id: string): Promise<void> {
  await fetch(`${API_URL}/monitors/${encodeURIComponent(id)}/run/cancel`, {
    method: 'POST',
  }).catch(() => undefined)
}

export type DataBackup = {
  version: number
  exportedAt: string
  store: {
    jobs: Record<string, Job>
    monitors: Monitor[]
    filters?: JobFilters
    theme?: 'light' | 'dark'
  }
  /** @deprecated backups antigos — agora vai em store.filters */
  filters?: JobFilters
  theme?: 'light' | 'dark'
}

export type UiPrefs = {
  filters: JobFilters
  theme: 'light' | 'dark'
}

export async function fetchUiPrefs(): Promise<UiPrefs> {
  const res = await fetch(`${API_URL}/prefs`)
  const data = await parseJson<UiPrefs & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return data
}

export async function saveUiPrefs(prefs: Partial<UiPrefs>): Promise<UiPrefs> {
  const res = await fetch(`${API_URL}/prefs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  })
  const data = await parseJson<UiPrefs & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return data
}

export async function exportAppData(): Promise<DataBackup> {
  const res = await fetch(`${API_URL}/data/export`)
  const data = await parseJson<DataBackup & { error?: string }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return data
}

export async function importAppData(backup: DataBackup): Promise<{
  jobs: number
  monitors: number
}> {
  const res = await fetch(`${API_URL}/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  })
  const data = await parseJson<{
    ok?: boolean
    jobs?: number
    monitors?: number
    error?: string
  }>(res)
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`)
  return {
    jobs: data.jobs ?? 0,
    monitors: data.monitors ?? 0,
  }
}

export type RunMonitorStreamHandlers = {
  onProgress: (progress: SearchProgress) => void
  onJobs?: (jobs: Job[]) => void
  signal?: AbortSignal
}

export async function runMonitorWithProgress(
  id: string,
  handlers: RunMonitorStreamHandlers,
): Promise<{
  monitor: Monitor | null
  cancelled: boolean
  stats: SearchRunStats | null
}> {
  const res = await fetch(
    `${API_URL}/monitors/${encodeURIComponent(id)}/run/stream`,
    { method: 'POST', signal: handlers.signal },
  )

  if (!res.ok) {
    const data = await parseJson<{ error?: string }>(res).catch(() => ({}))
    throw new Error(
      (data as { error?: string }).error || `Erro HTTP ${res.status}`,
    )
  }

  if (!res.body) {
    throw new Error('Resposta sem corpo (stream indisponível)')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let monitor: Monitor | null = null
  let streamError: string | null = null
  let cancelled = false

  const abortReader = () => {
    void reader.cancel().catch(() => undefined)
  }
  handlers.signal?.addEventListener('abort', abortReader)

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const parsed = parseSseChunk(part.trim())
        if (!parsed) continue
        try {
          const data = JSON.parse(parsed.data) as {
            error?: string
            monitor?: Monitor
            jobs?: Job[]
            cancelled?: boolean
          } & SearchProgress
          if (parsed.event === 'progress') {
            handlers.onProgress(data as SearchProgress)
          } else if (parsed.event === 'jobs' && data.jobs) {
            handlers.onJobs?.(data.jobs)
          } else if (parsed.event === 'done') {
            if (data.monitor) monitor = data.monitor
            cancelled = Boolean(data.cancelled)
          } else if (parsed.event === 'error') {
            streamError = data.error || 'Erro na busca'
            if (data.monitor) monitor = data.monitor
          }
        } catch {

        }
      }
    }
  } catch (err) {
    if (handlers.signal?.aborted) {
      cancelled = true
    } else {
      throw err
    }
  } finally {
    handlers.signal?.removeEventListener('abort', abortReader)
  }

  if (streamError && !cancelled) throw new Error(streamError)
  if (!monitor) {
    if (cancelled || handlers.signal?.aborted) {
      return { monitor: null, cancelled: true, stats: null }
    }
    throw new Error('Busca encerrada sem resultado')
  }
  return {
    monitor,
    cancelled,
    stats: monitor.lastRunStats ?? null,
  }
}
