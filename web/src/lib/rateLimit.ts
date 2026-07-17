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
  const base = `${usage.searchesThisHour}/${limits.maxPerHour} buscas nesta hora`

  if (!limit.allowed && limit.reason) {
    // Cooldown curto: a reason já traz o tempo; não repetir "Libera em ~00:04"
    if ((limit.retryAfterMs ?? 0) > 0 && (limit.retryAfterMs ?? 0) < 60_000) {
      return limit.reason
    }
    return wait ? `${limit.reason} Libera em ~${wait}.` : limit.reason
  }

  if (usage.remainingThisHour <= 1) {
    return `${base} — poucas buscas restantes (pooling conta na mesma cota).`
  }
  return `${base} · ${usage.remainingToday} restantes hoje`
}

export function isRateLimitError(message: string): boolean {
  return /limite|aguarde|pausa|rate|intervalo|hora|dia|proteção local/i.test(
    message,
  )
}
