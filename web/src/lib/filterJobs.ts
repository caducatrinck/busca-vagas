import type { Job, JobFilters } from './types'
import { detectLanguage } from './detectLanguage'

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function containsWholeWord(haystack: string, needle: string): boolean {
  const n = normalizeForMatch(needle.trim())
  if (!n) return false
  const h = normalizeForMatch(haystack)
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(n)}(?![\\p{L}\\p{N}_])`,
    'u',
  )
  return re.test(h)
}

/** Tokens que precisam de palavra inteira no filtro rápido da lista. */
const QUICK_FILTER_WHOLE_WORD = new Set(['java', 'javascript'])

function stripQuickFilterQuotes(token: string): string {
  return token.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
}

/**
 * Filtro rápido da lista de vagas: substring normal, exceto java/javascript
 * (palavra inteira, para "Java" não casar "Javascript" e vice-versa).
 */
export function matchesQuickFilter(text: string, query: string): boolean {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(stripQuickFilterQuotes)
    .filter(Boolean)
  if (tokens.length === 0) return true

  const haystack = normalizeForMatch(text)
  return tokens.every((raw) => {
    const token = normalizeForMatch(raw)
    if (!token) return true
    if (QUICK_FILTER_WHOLE_WORD.has(token)) {
      return containsWholeWord(haystack, token)
    }
    return haystack.includes(token)
  })
}

function queryTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((w) => normalizeForMatch(w))
    .filter((w) => w.length >= 2)
}

export function titleMatchesQuery(title: string, query: string): boolean {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return true
  return tokens.every((token) => containsWholeWord(title, token))
}

function containsAny(text: string, words: string[]): boolean {
  if (words.length === 0) return false
  return words.some((w) => containsWholeWord(text, w))
}

function containsRequired(text: string, words: string[]): boolean {
  const active = words.map((w) => w.trim()).filter(Boolean)
  if (active.length === 0) return true
  return active.some((w) => containsWholeWord(text, w))
}

export function filterJobs(
  jobs: Job[],
  filters: JobFilters,
  options: {
    useDescriptionFilters?: boolean

    requireQueryInTitle?: string
  } = {},
): Job[] {
  const useDescription = options.useDescriptionFilters ?? true
  const wanted = filters.language
  const requireQuery = options.requireQueryInTitle?.trim() ?? ''

  return jobs.filter((job) => {
    const title = job.title ?? ''
    const description = job.description ?? ''

    if (requireQuery && !titleMatchesQuery(title, requireQuery)) return false

    if (containsAny(title, filters.excludeTitle)) return false
    if (!containsRequired(title, filters.includeTitle)) return false

    if (useDescription) {
      if (containsAny(description, filters.excludeDescription)) return false
      if (!containsRequired(description, filters.includeDescription)) return false
    }

    if (wanted === 'pt' || wanted === 'en') {
      const sample =
        description.trim().length >= 24 ? description : `${title}\n${description}`
      const lang = detectLanguage(sample)
      if (lang === 'unknown') return sample.trim().length < 24
      if (lang !== wanted) return false
    }

    return true
  })
}

export function matchedWords(text: string, words: string[]): string[] {
  return words
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => containsWholeWord(text, w))
}
