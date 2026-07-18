import type { SearchForm } from '../../lib/types'
import type { SelectOption } from '../../ui'

export const POSTED_WITHIN_OPTIONS: Array<
  SelectOption<SearchForm['postedWithin']>
> = [
  { value: '30m', label: 'Últimos 30 minutos' },
  { value: '1h', label: 'Última hora' },
  { value: '10h', label: 'Últimas 10 horas' },
  { value: '24h', label: 'Últimas 24 horas' },
  { value: 'week', label: 'Última semana' },
  { value: 'month', label: 'Último mês' },
]

export function clampIntervalMinutes(minutes: number): number {
  return Math.min(Math.max(Number.isFinite(minutes) ? minutes : 20, 1), 120)
}

export function isCooldownErrorMessage(message: string): boolean {
  return /anti-spam|entre buscas|Aguarde \d+s/i.test(message)
}
