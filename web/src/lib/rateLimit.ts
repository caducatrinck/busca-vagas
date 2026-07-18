import type { Locale } from '../i18n/types'
import { translate } from '../i18n/messages'
import type { RateLimitInfo } from './api'
import { localizeVisibleError } from './localizeVisibleError'

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
  locale: Locale = 'pt',
): string {
  const t = (
    key: Parameters<typeof translate>[1],
    vars?: Record<string, string | number>,
  ) => translate(locale, key, vars)
  const { limits, usage } = limit
  const leftMs = remainingMs(limit, now)
  const wait = formatRateLimitWait(leftMs)
  const waitSec = Math.ceil(leftMs / 1000)
  const hourCap =
    limits.maxPerHour > 0
      ? t('rate.hourCap', {
          used: usage.searchesThisHour,
          max: limits.maxPerHour,
        })
      : t('rate.hourOpen', { used: usage.searchesThisHour })
  const dayPart =
    limits.maxPerDay > 0 && usage.remainingToday != null
      ? t('rate.dayLeft', { n: usage.remainingToday })
      : t('rate.dayUsed', { n: usage.searchesToday })

  if (!limit.allowed) {
    if (
      limit.source === 'cooldown' ||
      /anti-spam|entre buscas|between searches|err:cooldown/i.test(
        limit.reason ?? '',
      )
    ) {
      return waitSec > 0
        ? t('rate.waitCooldown', { n: waitSec })
        : t('rate.waitCooldownShort')
    }
    if (limit.reason) {
      return localizeVisibleError(limit.reason, t)
    }
    return wait
      ? t('rate.freesIn', { reason: '', wait }).trim()
      : t('rate.exceeded')
  }

  return `${hourCap}${dayPart}`
}

export function isRateLimitError(message: string): boolean {
  return /limite|aguarde|pausa|rate|intervalo|hora|dia|anti-spam|LinkedIn pediu|HTTP 429|HTTP 999|wait|limit|searches|hour|day|err:cooldown|err:local_cap|err:linkedin_|err:rate_/i.test(
    message,
  )
}
