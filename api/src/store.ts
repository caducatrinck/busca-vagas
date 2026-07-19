// Facade: mantém a API pública antiga de store.ts, mas a implementação
// agora vive em ./store/*. Não adicione lógica nova aqui, edite os módulos.

export type {
  AppSettings,
  DescriptionFilters,
  JobFilters,
  JobStatus,
  Monitor,
  PublicAppSettings,
  StoredJob,
  StoredRateLimit,
  StoreData,
  ThemeMode,
  UiPrefs,
} from './store/types.js'
export { RATE_LIMIT_DEFAULTS_REV } from './store/types.js'

export {
  defaultAppSettings,
  defaultDescriptionFilters,
  defaultJobFilters,
  normalizeCookieValue,
  normalizeDescriptionFilters,
  normalizeJobFilters,
  normalizeTheme,
} from './store/defaults.js'

export { getStore } from './store/persistence.js'

export {
  deleteAllJobs,
  deleteJobsByStatus,
  getJobSearchHints,
  listJobs,
  setJobApplied,
  setJobStatus,
  upsertSearchResults,
  withNewFlag,
} from './store/jobs.js'

export {
  createMonitorRecord,
  deleteMonitor,
  getMonitor,
  listMonitors,
  updateMonitor,
} from './store/monitors.js'

export {
  exportStoreData,
  getAppSettings,
  getRateLimitState,
  getUiPrefs,
  isAppConfigured,
  replaceStoreData,
  resetStoreToFactory,
  saveRateLimitState,
  toPublicSettings,
  updateAppSettings,
  updateUiPrefs,
} from './store/settings.js'
