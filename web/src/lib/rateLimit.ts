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

function remainingMs(limit: RateLimitInfo, now: number): number {
  const until = limit.usage?.nextAllowedAt
  if (until != null && until > 0) return Math.max(0, until - now)
  return Math.max(0, limit.retryAfterMs ?? 0)
}

export function formatRateLimitSummary(
  limit: RateLimitInfo,
  now = Date.now(),
): string {
  const { limits, usage } = limit
  const leftMs = remainingMs(limit, now)
  const wait = formatRateLimitWait(leftMs)
  const waitSec = Math.ceil(leftMs / 1000)
  const hourCap =
    limits.maxPerHour > 0
      ? `${usage.searchesThisHour}/${limits.maxPerHour} nesta hora`
      : `${usage.searchesThisHour} buscas nesta hora`
  const dayPart =
    limits.maxPerDay > 0 && usage.remainingToday != null
      ? ` · ${usage.remainingToday} restantes hoje (teto opcional)`
      : ` · ${usage.searchesToday} hoje`

  if (!limit.allowed) {
    if (
      limit.source === 'cooldown' ||
      /anti-spam|entre buscas/i.test(limit.reason ?? '')
    ) {
      return waitSec > 0
        ? `Aguarde ${waitSec}s entre buscas`
        : 'Aguarde entre buscas'
    }
    if (limit.source === 'linkedin') {
      return wait ? `${limit.reason} Libera em ~${wait}.` : (limit.reason ?? '')
    }
    return wait ? `${limit.reason} Libera em ~${wait}.` : (limit.reason ?? '')
  }

  return `${hourCap}${dayPart}`
}

export function isRateLimitError(message: string): boolean {
  return /limite|aguarde|pausa|rate|intervalo|hora|dia|anti-spam|LinkedIn pediu|HTTP 429|HTTP 999/i.test(
    message,
  )
}
