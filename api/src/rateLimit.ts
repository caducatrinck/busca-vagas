import {
  getAppSettings,
  getRateLimitState,
  saveRateLimitState,
  type StoredRateLimit,
} from './store.js'

export type RateLimitConfig = {
  /** Intervalo mínimo entre buscas (anti-spam local). 0 = desligado. */
  minIntervalMs: number
  /**
   * Limites opcionais de segurança. 0 = desligados.
   * O bloqueio principal vem de erros reais do LinkedIn (blockedUntil).
   */
  maxPerHour: number
  maxPerDay: number
}

export type RateLimitSnapshot = {
  allowed: boolean
  reason?: string
  retryAfterMs?: number
  source?: 'linkedin' | 'cooldown' | 'local-cap' | null
  limits: RateLimitConfig
  usage: {
    lastSearchAt: number | null
    searchesThisHour: number
    searchesToday: number
    remainingThisHour: number | null
    remainingToday: number | null
    nextAllowedAt: number | null
    blockedUntil: number | null
    lastLinkedInStatus: number | null
  }
}

type SearchEvent = {
  at: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const DEFAULT_LINKEDIN_429_MS = 15 * 60_000
const DEFAULT_LINKEDIN_999_MS = 30 * 60_000

export function getRateLimitConfig(): RateLimitConfig {
  return {
    minIntervalMs: 5_000,
    maxPerHour: 0,
    maxPerDay: 0,
  }
}

export class SearchRateLimiter {
  private events: SearchEvent[] = []
  private lastSearchAt: number | null = null
  private blockedUntil: number | null = null
  private blockReason: string | null = null
  private lastLinkedInStatus: number | null = null
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
    this.blockedUntil =
      typeof state.blockedUntil === 'number' && state.blockedUntil > 0
        ? state.blockedUntil
        : null
    this.blockReason =
      typeof state.blockReason === 'string' && state.blockReason.trim()
        ? state.blockReason
        : null
    this.lastLinkedInStatus =
      typeof state.lastLinkedInStatus === 'number'
        ? state.lastLinkedInStatus
        : null
    this.prune()
  }

  private toStored(): StoredRateLimit {
    return {
      events: this.events.map((e) => e.at),
      lastSearchAt: this.lastSearchAt,
      blockedUntil: this.blockedUntil,
      blockReason: this.blockReason,
      lastLinkedInStatus: this.lastLinkedInStatus,
    }
  }

  private persist(): void {
    if (!this.persistEnabled) return
    void saveRateLimitState(this.toStored())
  }

  private prune(now = Date.now()): void {
    const dayAgo = now - DAY_MS
    this.events = this.events.filter((e) => e.at >= dayAgo)
    if (this.blockedUntil != null && this.blockedUntil <= now) {
      this.blockedUntil = null
      this.blockReason = null
    }
  }

  private searchesInWindow(now: number, windowMs: number): number {
    const since = now - windowMs
    return this.events.filter((e) => e.at >= since).length
  }

  /**
   * Registra bloqueio a partir de resposta real do LinkedIn (429/999/Retry-After).
   */
  registerLinkedInBlock(input: {
    retryAfterMs?: number
    status?: number
    message?: string
    now?: number
  }): RateLimitSnapshot {
    const now = input.now ?? Date.now()
    const status = input.status ?? null
    let wait = input.retryAfterMs
    if (wait == null || !Number.isFinite(wait) || wait <= 0) {
      wait =
        status === 999 ? DEFAULT_LINKEDIN_999_MS : DEFAULT_LINKEDIN_429_MS
    }
    wait = Math.min(Math.max(Math.ceil(wait), 5_000), DAY_MS)
    const until = now + wait
    if (this.blockedUntil == null || until > this.blockedUntil) {
      this.blockedUntil = until
    }
    this.lastLinkedInStatus = status
    const waitLabel = Math.ceil(wait / 1000)
    this.blockReason =
      input.message?.trim() ||
      (status === 999
        ? `LinkedIn anti-bot (HTTP 999). Pausando ~${waitLabel}s.`
        : status === 429
          ? `LinkedIn rate limit (HTTP 429). Pausando ~${waitLabel}s.`
          : `LinkedIn pediu pausa. Aguarde ~${waitLabel}s.`)
    this.persist()
    return this.snapshot(now)
  }

  /** Interpreta erro lançado pelo client LinkedIn e atualiza o bloqueio se for rate/anti-bot. */
  noteLinkedInError(err: unknown, now = Date.now()): boolean {
    if (!(err instanceof Error)) return false
    const status = (err as Error & { linkedInStatus?: number }).linkedInStatus
    const retryAfterMs = (err as Error & { retryAfterMs?: number }).retryAfterMs
    const msg = err.message
    const isLinkedInThrottle =
      status === 429 ||
      status === 999 ||
      /LinkedIn rate limit|HTTP 429|HTTP 999|anti-bot/i.test(msg)

    if (!isLinkedInThrottle) return false

    this.registerLinkedInBlock({
      retryAfterMs,
      status,
      message: msg,
      now,
    })
    return true
  }

  clearLinkedInBlock(now = Date.now()): void {
    this.blockedUntil = null
    this.blockReason = null
    this.prune(now)
    this.persist()
  }

  snapshot(now = Date.now()): RateLimitSnapshot {
    this.prune(now)
    const config = this.config
    const searchesThisHour = this.searchesInWindow(now, HOUR_MS)
    const searchesToday = this.events.length

    const nextByCooldown =
      config.minIntervalMs > 0 && this.lastSearchAt
        ? this.lastSearchAt + config.minIntervalMs
        : null
    const cooldownUntil =
      nextByCooldown && nextByCooldown > now ? nextByCooldown : null

    const linkedInUntil =
      this.blockedUntil && this.blockedUntil > now ? this.blockedUntil : null

    let localCapUntil: number | null = null
    let localCapReason: string | undefined
    if (config.maxPerHour > 0 && searchesThisHour >= config.maxPerHour) {
      const oldestInHour = this.events.find((e) => e.at >= now - HOUR_MS)
      localCapUntil = (oldestInHour?.at ?? now) + HOUR_MS
      localCapReason = `Limite de segurança local: ${config.maxPerHour} buscas/hora (opcional).`
    } else if (config.maxPerDay > 0 && searchesToday >= config.maxPerDay) {
      localCapUntil = now + DAY_MS
      localCapReason = `Limite de segurança local: ${config.maxPerDay} buscas/dia (opcional).`
    }

    const candidates: Array<{
      until: number
      reason: string
      source: 'linkedin' | 'cooldown' | 'local-cap'
    }> = []
    if (linkedInUntil) {
      candidates.push({
        until: linkedInUntil,
        reason: this.blockReason || 'LinkedIn pediu pausa.',
        source: 'linkedin',
      })
    }
    if (cooldownUntil) {
      const waitSec = Math.max(1, Math.ceil((cooldownUntil - now) / 1000))
      candidates.push({
        until: cooldownUntil,
        reason:
          waitSec === 1
            ? 'Pausa de 1s entre buscas (anti-spam local).'
            : `Pausa de ${waitSec}s entre buscas (anti-spam local).`,
        source: 'cooldown',
      })
    }
    if (localCapUntil && localCapReason) {
      candidates.push({
        until: localCapUntil,
        reason: localCapReason,
        source: 'local-cap',
      })
    }

    candidates.sort((a, b) => b.until - a.until)
    const top = candidates[0]

    const allowed = !top
    const nextAllowedAt = top?.until ?? null
    const retryAfterMs = top ? Math.max(0, top.until - now) : undefined

    return {
      allowed,
      reason: top?.reason,
      retryAfterMs,
      source: top?.source ?? null,
      limits: config,
      usage: {
        lastSearchAt: this.lastSearchAt,
        searchesThisHour,
        searchesToday,
        remainingThisHour:
          config.maxPerHour > 0
            ? Math.max(0, config.maxPerHour - searchesThisHour)
            : null,
        remainingToday:
          config.maxPerDay > 0
            ? Math.max(0, config.maxPerDay - searchesToday)
            : null,
        nextAllowedAt,
        blockedUntil: linkedInUntil,
        lastLinkedInStatus: this.lastLinkedInStatus,
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
