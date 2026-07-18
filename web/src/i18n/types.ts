export type Locale = 'pt' | 'en'

export const DEFAULT_LOCALE: Locale = 'pt'

export function normalizeLocale(raw?: unknown): Locale {
  return raw === 'en' ? 'en' : 'pt'
}
