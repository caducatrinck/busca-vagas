import type { SearchForm } from '../../lib/types'

/** Valores de “Publicadas em” — labels vêm de i18n (`search.posted.*`). */
export const POSTED_WITHIN_VALUES: Array<SearchForm['postedWithin']> = [
  '30m',
  '1h',
  '10h',
  '24h',
  'week',
  'month',
]

export function clampIntervalMinutes(minutes: number): number {
  return Math.min(Math.max(Number.isFinite(minutes) ? minutes : 20, 1), 120)
}

export function isCooldownErrorMessage(message: string): boolean {
  return /anti-spam|entre buscas|between searches|Aguarde \d+s|Wait \d+s|err:cooldown/i.test(
    message,
  )
}
