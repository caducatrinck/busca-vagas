export function resolvePoolingPostedSeconds(
  intervalMinutes: number,
  lastRunAt: string | null,
  now = Date.now(),
): number {
  const intervalSec = Math.max(1, intervalMinutes) * 60
  const waitedSec = lastRunAt
    ? Math.max(0, Math.floor((now - new Date(lastRunAt).getTime()) / 1000))
    : intervalSec
  const coverageSec = Math.max(waitedSec, intervalSec)
  const bufferSec = Math.max(10 * 60, Math.ceil(coverageSec * 0.5))
  const windowSec = coverageSec + bufferSec
  return Math.min(Math.max(windowSec, 10 * 60), 24 * 60 * 60)
}
