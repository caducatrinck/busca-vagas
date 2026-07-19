import type {
  AppSettings,
  JobFilters,
  PublicAppSettings,
  StoredJob,
  StoredRateLimit,
  StoreData,
  UiPrefs,
} from './types.js'
import {
  createMonitor,
  DEFAULT_RATE_LIMIT,
  defaultAppSettings,
  defaultJobFilters,
  isLikelyLinkedInJsessionId,
  normalizeCookieValue,
  normalizeJob,
  normalizeJobFilters,
  normalizeRateLimit,
  normalizeSettings,
  normalizeTheme,
  normalizeLocale,
} from './defaults.js'
import { ensureStore, persist, clearInternalStoreBackups } from './persistence.js'

export async function getAppSettings(): Promise<AppSettings> {
  const store = await ensureStore()
  return { ...store.settings }
}

export function isAppConfigured(settings: AppSettings): boolean {
  return Boolean(settings.linkedinLiAt.trim())
}

export function toPublicSettings(settings: AppSettings): PublicAppSettings {
  const li = settings.linkedinLiAt
  const ready = isAppConfigured(settings)
  return {
    ready,
    linkedinLiAtSet: ready,
    linkedinLiAtHint: li
      ? li.length <= 4
        ? '••••'
        : `••••${li.slice(-4)}`
      : '',
    linkedinJsessionIdSet: Boolean(settings.linkedinJsessionId),
    linkedinMaxPages: settings.linkedinMaxPages,
    searchCooldownMs: settings.searchCooldownMs,
    maxSearchesPerHour: settings.maxSearchesPerHour,
    maxSearchesPerDay: settings.maxSearchesPerDay,
    jobDetailConcurrency: settings.jobDetailConcurrency,
  }
}

export async function updateAppSettings(
  patch: Partial<AppSettings> & {

    clearLinkedinLiAt?: boolean
    clearLinkedinJsessionId?: boolean
  },
): Promise<AppSettings> {
  const store = await ensureStore()
  const current = store.settings

  let linkedinLiAt = current.linkedinLiAt
  if (patch.clearLinkedinLiAt) linkedinLiAt = ''
  else if (typeof patch.linkedinLiAt === 'string') {
    linkedinLiAt = normalizeCookieValue(patch.linkedinLiAt)
  }

  let linkedinJsessionId = current.linkedinJsessionId
  if (patch.clearLinkedinJsessionId) linkedinJsessionId = ''
  else if (typeof patch.linkedinJsessionId === 'string') {
    linkedinJsessionId = normalizeCookieValue(patch.linkedinJsessionId)
    if (linkedinJsessionId && !isLikelyLinkedInJsessionId(linkedinJsessionId)) {
      const err = new Error('err:jsession_invalid')
      throw err
    }
  }

  store.settings = normalizeSettings({
    ...current,
    ...patch,
    linkedinLiAt,
    linkedinJsessionId,
  })
  await persist(store)
  return { ...store.settings }
}

export async function getUiPrefs(): Promise<UiPrefs> {
  const store = await ensureStore()
  return {
    filters: normalizeJobFilters(store.filters),
    theme: normalizeTheme(store.theme),
    locale: normalizeLocale(store.locale),
  }
}

export async function updateUiPrefs(
  patch: Partial<UiPrefs>,
): Promise<UiPrefs> {
  const store = await ensureStore()
  if (patch.filters) {
    store.filters = normalizeJobFilters(patch.filters)
  }
  if (patch.theme !== undefined) {
    store.theme = normalizeTheme(patch.theme)
  }
  if (patch.locale !== undefined) {
    store.locale = normalizeLocale(patch.locale)
  }
  await persist(store)
  return getUiPrefs()
}

export async function exportStoreData(): Promise<StoreData> {
  const store = await ensureStore()
  return structuredClone(store)
}

export async function getRateLimitState(): Promise<StoredRateLimit> {
  const store = await ensureStore()
  return normalizeRateLimit(store.rateLimit)
}

export async function saveRateLimitState(
  state: StoredRateLimit,
): Promise<void> {
  const store = await ensureStore()
  store.rateLimit = normalizeRateLimit(state)
  await persist(store)
}

export async function replaceStoreData(
  incoming: Partial<StoreData> & { filters?: Partial<JobFilters> },
): Promise<StoreData> {
  const jobs: Record<string, StoredJob> = {}
  for (const [id, raw] of Object.entries(incoming.jobs ?? {})) {
    const job = raw as StoredJob
    jobs[id] = normalizeJob({ ...job, id: job.id || id })
  }

  const monitors = Array.isArray(incoming.monitors)
    ? incoming.monitors.map((m) => createMonitor(m))
    : []

  const current = await ensureStore()
  const next: StoreData = {
    jobs,
    monitors,
    rateLimit: normalizeRateLimit(incoming.rateLimit),
    settings: normalizeSettings(incoming.settings ?? current.settings),
    filters: normalizeJobFilters(incoming.filters ?? current.filters),
    theme: normalizeTheme(
      incoming.theme !== undefined ? incoming.theme : current.theme,
    ),
    locale: normalizeLocale(
      incoming.locale !== undefined ? incoming.locale : current.locale,
    ),
  }
  await persist(next, { allowEmptyOverwrite: true })
  return next
}

/** Zera o store como instalação nova (sem puxar cookies de env).
 *  Não toca nos JSON exportados em Downloads — só limpa store + backups internos. */
export async function resetStoreToFactory(): Promise<StoreData> {
  const next: StoreData = {
    jobs: {},
    monitors: [],
    rateLimit: { ...DEFAULT_RATE_LIMIT },
    settings: defaultAppSettings(),
    filters: defaultJobFilters(),
    theme: 'light',
    locale: 'pt',
  }
  await persist(next, { allowEmptyOverwrite: true, skipBackup: true })
  await clearInternalStoreBackups()
  return next
}
