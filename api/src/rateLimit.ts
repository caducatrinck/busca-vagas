import {
  getAppSettings,
  getRateLimitState,
  saveRateLimitState,
  type StoredRateLimit,
} from './store.js'

export type RateLimitConfig = {
  minIntervalMs: number
  maxPerHour: number
  maxPerDay: number
}

export type RateLimitSnapshot = {
  allowed: boolean
  reason?: string
  retryAfterMs?: number
  limits: RateLimitConfig
  usage: {
    lastSearchAt: number | null
    searchesThisHour: number
    searchesToday: number
    remainingThisHour: number
    remainingToday: number
    nextAllowedAt: number | null
  }
}

type SearchEvent = {
  at: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export function getRateLimitConfig(): RateLimitConfig {
  return {
    minIntervalMs: 5_000,
    maxPerHour: 60,
    maxPerDay: 300,
  }
}

export class SearchRateLimiter {
  private events: SearchEvent[] = []
  private lastSearchAt: number | null = null
  private config: RateLimitConfig
  private persistEnabled = false

  constructor(config = getRateLimitConfig()) {
    this.config = { ...config }
  }

  updateConfig(partial: Partial<RateLimitConfig>): void {
    this.config = {
      minIntervalMs: partial.minIntervalMs ?? this.config.minIntervalMs,
      maxPerHour: partial.maxPerHour ?? this.config.maxPerHour,
      maxPerDay: partial.maxPerDay ?? this.config.maxPerDay,
    }
  }

  enablePersist(): void {
    this.persistEnabled = true
  }

  hydrate(state: StoredRateLimit): void {
    this.events = state.events.map((at) => ({ at }))
    this.lastSearchAt = state.lastSearchAt
    this.prune()
  }

  private toStored(): StoredRateLimit {
    return {
      events: this.events.map((e) => e.at),
      lastSearchAt: this.lastSearchAt,
    }
  }

  private persist(): void {
    if (!this.persistEnabled) return
    void saveRateLimitState(this.toStored())
  }

  private prune(now = Date.now()): void {
    const dayAgo = now - DAY_MS
    this.events = this.events.filter((e) => e.at >= dayAgo)
  }

  private searchesInWindow(now: number, windowMs: number): number {
    const since = now - windowMs
    return this.events.filter((e) => e.at >= since).length
  }

  snapshot(now = Date.now()): RateLimitSnapshot {
    this.prune(now)
    const config = this.config
    const searchesThisHour = this.searchesInWindow(now, HOUR_MS)
    const searchesToday = this.events.length

    const nextByCooldown = this.lastSearchAt
      ? this.lastSearchAt + config.minIntervalMs
      : null
    const nextAllowedAt =
      nextByCooldown && nextByCooldown > now ? nextByCooldown : null

    let allowed = true
    let reason: string | undefined
    let retryAfterMs: number | undefined

    if (nextAllowedAt) {
      allowed = false
      const waitSec = Math.max(1, Math.ceil((nextAllowedAt - now) / 1000))
      reason =
        waitSec === 1
          ? 'Pausa de 1s entre buscas (proteção local contra bloqueio do LinkedIn).'
          : `Pausa de ${waitSec}s entre buscas (proteção local contra bloqueio do LinkedIn).`
      retryAfterMs = nextAllowedAt - now
    } else if (searchesThisHour >= config.maxPerHour) {
      const oldestInHour = this.events.find((e) => e.at >= now - HOUR_MS)
      const resetAt = (oldestInHour?.at ?? now) + HOUR_MS
      allowed = false
      reason = `Limite horário local: ${config.maxPerHour} buscas/hora (pooling e manuais contam juntos).`
      retryAfterMs = Math.max(0, resetAt - now)
    } else if (searchesToday >= config.maxPerDay) {
      allowed = false
      reason = `Limite diário local: ${config.maxPerDay} buscas/dia (pooling e manuais contam juntos).`
      retryAfterMs = DAY_MS
    }

    return {
      allowed,
      reason,
      retryAfterMs,
      limits: config,
      usage: {
        lastSearchAt: this.lastSearchAt,
        searchesThisHour,
        searchesToday,
        remainingThisHour: Math.max(0, config.maxPerHour - searchesThisHour),
        remainingToday: Math.max(0, config.maxPerDay - searchesToday),
        nextAllowedAt,
      },
    }
  }

  assertAllowed(now = Date.now()): RateLimitSnapshot {
    const snap = this.snapshot(now)
    if (!snap.allowed) {
      const err = new Error(snap.reason || 'Rate limit excedido')
      ;(err as Error & { retryAfterMs?: number }).retryAfterMs = snap.retryAfterMs
      throw err
    }
    return snap
  }

  recordSearch(now = Date.now()): RateLimitSnapshot {
    this.assertAllowed(now)
    this.events.push({ at: now })
    this.lastSearchAt = now
    this.prune(now)
    this.persist()
    return this.snapshot(now)
  }
}

export const searchRateLimiter = new SearchRateLimiter()

export async function restoreRateLimitFromDisk(): Promise<void> {
  const settings = await getAppSettings()
  searchRateLimiter.updateConfig({
    minIntervalMs: settings.searchCooldownMs,
    maxPerHour: settings.maxSearchesPerHour,
    maxPerDay: settings.maxSearchesPerDay,
  })
  const state = await getRateLimitState()
  searchRateLimiter.hydrate(state)
  searchRateLimiter.enablePersist()
}

export async function getScrapeDelayConfig() {
  const settings = await getAppSettings()
  return {
    detailConcurrency: settings.jobDetailConcurrency,
  }
}

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const min = Math.min(minMs, maxMs)
  const max = Math.max(minMs, maxMs)
  const ms = min + Math.floor(Math.random() * (max - min + 1))
  return new Promise((resolve) => setTimeout(resolve, ms))
}
