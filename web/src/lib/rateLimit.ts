import type { RateLimitInfo } from './api'

export function formatRateLimitWait(retryAfterMs?: number): string | null {
  if (retryAfterMs == null || retryAfterMs <= 0) return null
  const totalSec = Math.ceil(retryAfterMs / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}min ${pad(s)}s`
}

export function formatRateLimitSummary(limit: RateLimitInfo): string {
  const { limits, usage } = limit
  const wait = formatRateLimitWait(limit.retryAfterMs)
  const hourCap =
    limits.maxPerHour > 0
      ? `${usage.searchesThisHour}/${limits.maxPerHour} nesta hora`
      : `${usage.searchesThisHour} buscas nesta hora`
  const dayPart =
    limits.maxPerDay > 0 && usage.remainingToday != null
      ? ` · ${usage.remainingToday} restantes hoje (teto opcional)`
      : ` · ${usage.searchesToday} hoje`

  if (!limit.allowed && limit.reason) {
    if (limit.source === 'linkedin') {
      return wait ? `${limit.reason} Libera em ~${wait}.` : limit.reason
    }
    if ((limit.retryAfterMs ?? 0) > 0 && (limit.retryAfterMs ?? 0) < 60_000) {
      return limit.reason
    }
    return wait ? `${limit.reason} Libera em ~${wait}.` : limit.reason
  }

  return `${hourCap}${dayPart}`
}

export function isRateLimitError(message: string): boolean {
  return /limite|aguarde|pausa|rate|intervalo|hora|dia|anti-spam|LinkedIn pediu|HTTP 429|HTTP 999/i.test(
    message,
  )
}
