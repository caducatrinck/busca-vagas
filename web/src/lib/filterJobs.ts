import type { AppTag, Job, JobFilters } from './types'
import {
  WORKPLACE_TYPE_LABELS,
  parseContractTags,
  resolveWorkplaceType,
  type WorkplaceType,
} from '../shared/domain'
import {
  jobMatchesExcludedTags,
  jobMatchesSelectedTags,
  jobSearchHaystack,
  textMatchesQueryTokens,
} from '../shared/tags'
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

const QUICK_FILTER_WHOLE_WORD = new Set(['java', 'javascript'])

const WORKPLACE_SEARCH_ALIASES: Record<WorkplaceType, string> = {
  hybrid: 'hibrido hybrid',
  onsite: 'presencial on-site onsite',
  remote: 'remoto remote',
}

export function workplaceSearchText(
  job: Pick<Job, 'workplaceType' | 'description'>,
): string {
  const t = resolveWorkplaceType(job.workplaceType, job.description)
  if (!t) return ''
  return `${WORKPLACE_TYPE_LABELS[t]} ${WORKPLACE_SEARCH_ALIASES[t]}`
}

export function titleSearchText(
  job: Pick<Job, 'title' | 'workplaceType' | 'contractTags' | 'description'>,
): string {
  const contracts =
    job.contractTags?.length
      ? job.contractTags.join(' ')
      : parseContractTags(job.description ?? '').join(' ')
  return `${job.title ?? ''} ${workplaceSearchText(job)} ${contracts}`.trim()
}

export function fullTextSearchHaystack(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
): string {
  return jobSearchHaystack(job)
}

function stripQuickFilterQuotes(token: string): string {
  return token.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
}

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

export function matchesTextFilter(job: Job, query: string): boolean {
  return textMatchesQueryTokens(fullTextSearchHaystack(job), query)
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
    catalogTags?: AppTag[]
  } = {},
): Job[] {
  const useDescription = options.useDescriptionFilters ?? true
  const wanted = filters.language
  const requireQuery = options.requireQueryInTitle?.trim() ?? ''
  const catalog = options.catalogTags ?? []
  const selectedIds = filters.selectedTagIds ?? []
  const excludedIds = filters.excludedTagIds ?? []
  const selectedTags = catalog.filter((tag) => selectedIds.includes(tag.id))
  const excludedTags = catalog.filter((tag) => excludedIds.includes(tag.id))

  if (selectedIds.length > 0 && selectedTags.length === 0) return []
  if (excludedIds.length > 0 && catalog.length === 0) return []

  return jobs.filter((job) => {
    const titleHaystack = titleSearchText(job)
    const description = job.description ?? ''

    if (requireQuery && !titleMatchesQuery(titleHaystack, requireQuery)) {
      return false
    }

    if (containsAny(titleHaystack, filters.excludeTitle)) return false
    if (!containsRequired(titleHaystack, filters.includeTitle)) return false

    if (useDescription) {
      if (containsAny(description, filters.excludeDescription)) return false
      if (!containsRequired(description, filters.includeDescription)) return false
    }

    if (jobMatchesExcludedTags(job, excludedTags)) return false
    if (!jobMatchesSelectedTags(job, selectedTags)) return false

    if (wanted === 'pt' || wanted === 'en') {
      const sample =
        description.trim().length >= 24
          ? description
          : `${job.title ?? ''}\n${description}`
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
