// thin facade kept for backwards compat — real implementation lives under ./poller/
import { resolvePoolingPostedSeconds as resolvePoolingWindow } from './domain/poolingWindow.js'

export type { MonitorStatus, MonitorRunCallbacks, MonitorRunMode } from './poller/types.js'

export { cancelMonitorRun, isMonitorRunning } from './poller/runtime.js'

export {
  syncSchedulers,
  getMonitorStatus,
  listMonitorStatuses,
  runMonitorNow,
  setMonitorPolling,
  restoreSchedulersFromDisk,
} from './poller/schedule.js'

export function resolvePoolingPostedSeconds(
  intervalMinutes: number,
  lastRunAt: string | null,
  now = Date.now(),
): number {
  return resolvePoolingWindow(intervalMinutes, lastRunAt, now)
}
