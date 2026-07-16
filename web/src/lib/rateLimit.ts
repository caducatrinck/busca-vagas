import type { RateLimitInfo } from './api'

export function formatRateLimitWait(retryAfterMs?: number): string | null {
  if (retryAfterMs == null || retryAfterMs <= 0) return null
  const totalSec = Math.ceil(retryAfterMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

export function formatRateLimitSummary(limit: RateLimitInfo): string {
  const { limits, usage } = limit
  const wait = formatRateLimitWait(limit.retryAfterMs)
  const base = `${usage.searchesThisHour}/${limits.maxPerHour} buscas nesta hora`
  if (!limit.allowed && limit.reason) {
    return wait ? `${limit.reason} Libera em ~${wait}.` : limit.reason
  }
  if (usage.remainingThisHour <= 1) {
    return `${base} — poucas buscas restantes (pooling conta na mesma cota).`
  }
  return `${base} · ${usage.remainingToday} restantes hoje`
}

export function isRateLimitError(message: string): boolean {
  return /limite|aguarde|rate|intervalo|hora|dia/i.test(message)
}
