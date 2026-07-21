import type { StoreRepository } from '../../application/ports.js'
import * as store from '../../store.js'

export const storeRepository: StoreRepository = {
  listJobs: store.listJobs,
  setJobStatus: store.setJobStatus,
  setJobApplied: store.setJobApplied,
  deleteJobsByStatus: store.deleteJobsByStatus,
  deleteAllJobs: store.deleteAllJobs,
  upsertSearchResults: store.upsertSearchResults,
  withNewFlag: store.withNewFlag,
  getJobSearchHints: store.getJobSearchHints,
  listTags: store.listTags,
  createTag: store.createTag,
  deleteTag: store.deleteTag,
  listMonitors: store.listMonitors,
  getMonitor: store.getMonitor,
  createMonitor: store.createMonitorRecord,
  updateMonitor: store.updateMonitor,
  deleteMonitor: store.deleteMonitor,
  getAppSettings: store.getAppSettings,
  updateAppSettings: store.updateAppSettings,
  isAppConfigured: (settings) =>
    settings
      ? store.isAppConfigured(settings)
      : store.getAppSettings().then(store.isAppConfigured),
  toPublicSettings: store.toPublicSettings,
  exportStoreData: store.exportStoreData,
  replaceStoreData: store.replaceStoreData,
  resetStoreToFactory: store.resetStoreToFactory,
  getRateLimitState: store.getRateLimitState,
  saveRateLimitState: store.saveRateLimitState,
  getStore: store.getStore,
  getUiPrefs: store.getUiPrefs,
  updateUiPrefs: store.updateUiPrefs,
}
