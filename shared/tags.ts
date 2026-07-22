import {
  parseContractTags,
  resolveWorkplaceType,
  type Job,
  type WorkplaceType,
} from './domain.js'

export const MAX_TAG_LABEL_LENGTH = 32

export const MAX_APP_TAGS = Number.POSITIVE_INFINITY

export type AppTagKind = 'workplace' | 'contract' | 'custom'

export type AppTag = {
  id: string
  label: string
  kind: AppTagKind
  builtin: boolean
}

export const BUILTIN_TAGS: readonly AppTag[] = [
  { id: 'hybrid', label: 'Híbrido', kind: 'workplace', builtin: true },
  { id: 'onsite', label: 'Presencial', kind: 'workplace', builtin: true },
  { id: 'remote', label: 'Remoto', kind: 'workplace', builtin: true },
  { id: 'CLT', label: 'CLT', kind: 'contract', builtin: true },
  { id: 'PJ', label: 'PJ', kind: 'contract', builtin: true },
] as const

const WORKPLACE_BY_TAG_ID: Record<string, WorkplaceType> = {
  hybrid: 'hybrid',
  onsite: 'onsite',
  remote: 'remote',
}

const WORKPLACE_ALIASES: Record<WorkplaceType, string[]> = {
  hybrid: ['hibrido', 'hibrida', 'hybrid'],
  onsite: ['presencial', 'onsite', 'on-site'],
  remote: ['remoto', 'remota', 'remote'],
}

export function normalizeTagLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function isWordCharCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code > 127
  )
}

export function containsWholeWordNormalized(
  normalizedHaystack: string,
  needle: string,
): boolean {
  const n = normalizeTagLabel(needle)
  if (!n || !normalizedHaystack) return false
  let from = 0
  while (from <= normalizedHaystack.length) {
    const i = normalizedHaystack.indexOf(n, from)
    if (i < 0) return false
    const beforeOk =
      i === 0 || !isWordCharCode(normalizedHaystack.charCodeAt(i - 1))
    const afterIdx = i + n.length
    const afterOk =
      afterIdx >= normalizedHaystack.length ||
      !isWordCharCode(normalizedHaystack.charCodeAt(afterIdx))
    if (beforeOk && afterOk) return true
    from = i + 1
  }
  return false
}

export function containsWholeWord(haystack: string, needle: string): boolean {
  const n = normalizeTagLabel(needle)
  if (!n) return false
  return containsWholeWordNormalized(normalizeTagLabel(haystack), n)
}

export function queryTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((w) => normalizeTagLabel(w))
    .filter((w) => w.length >= 2)
}

export function textMatchesQueryTokens(text: string, query: string): boolean {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return true
  return tokens.every((token) => containsWholeWord(text, token))
}

export function jobSearchHaystack(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
): string {
  const workplace = resolveWorkplaceType(job.workplaceType, job.description)
  const workplaceText = workplace
    ? `${workplace} ${WORKPLACE_ALIASES[workplace].join(' ')}`
    : ''
  const contracts =
    job.contractTags?.length
      ? job.contractTags.join(' ')
      : parseContractTags(job.description ?? '').join(' ')
  return `${job.title ?? ''} ${job.description ?? ''} ${workplaceText} ${contracts}`
}

export function jobTitleHaystack(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
): string {
  const workplace = resolveWorkplaceType(job.workplaceType, job.description)
  const workplaceText = workplace
    ? `${workplace} ${WORKPLACE_ALIASES[workplace].join(' ')}`
    : ''
  const contracts =
    job.contractTags?.length
      ? job.contractTags.join(' ')
      : parseContractTags(job.description ?? '').join(' ')
  return `${job.title ?? ''} ${workplaceText} ${contracts}`
}

export function tagMatchesJob(
  tag: AppTag,
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  prepared?: {
    normalizedHaystack: string
    workplace: ReturnType<typeof resolveWorkplaceType>
    contracts: string[]
  },
): boolean {
  const workplace =
    prepared?.workplace ??
    resolveWorkplaceType(job.workplaceType, job.description)
  const contracts =
    prepared?.contracts ??
    (job.contractTags?.length
      ? job.contractTags
      : parseContractTags(job.description ?? ''))
  const haystack =
    prepared?.normalizedHaystack ??
    normalizeTagLabel(jobSearchHaystack(job))

  if (tag.kind === 'workplace') {
    const wanted = WORKPLACE_BY_TAG_ID[tag.id]
    if (wanted) {
      if (workplace === wanted) return true
      return WORKPLACE_ALIASES[wanted].some((alias) =>
        containsWholeWordNormalized(haystack, alias),
      )
    }
  }

  if (tag.kind === 'contract') {
    if (contracts.includes(tag.label as 'CLT' | 'PJ')) return true
    return containsWholeWordNormalized(haystack, tag.label)
  }

  return containsWholeWordNormalized(haystack, tag.label)
}

function prepareJobTagMatch(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  opts?: { maxDescriptionChars?: number },
) {
  const maxDesc = opts?.maxDescriptionChars
  const description =
    maxDesc != null && (job.description?.length ?? 0) > maxDesc
      ? (job.description ?? '').slice(0, maxDesc)
      : (job.description ?? '')
  const slim =
    maxDesc != null
      ? { ...job, description }
      : job
  return {
    normalizedHaystack: normalizeTagLabel(jobSearchHaystack(slim)),
    workplace: resolveWorkplaceType(job.workplaceType, job.description),
    contracts: job.contractTags?.length
      ? job.contractTags
      : parseContractTags(job.description ?? ''),
  }
}

export function jobMatchesSelectedTags(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  selectedTags: AppTag[],
): boolean {
  if (selectedTags.length === 0) return true
  const prepared = prepareJobTagMatch(job)
  return selectedTags.some((tag) => tagMatchesJob(tag, job, prepared))
}

export function jobMatchesExcludedTags(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  excludedTags: AppTag[],
): boolean {
  if (excludedTags.length === 0) return false
  const prepared = prepareJobTagMatch(job)
  return excludedTags.some((tag) => tagMatchesJob(tag, job, prepared))
}

export function jobMatchesAnySearchQuery(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  queries: string[],
): boolean {
  const active = queries.map((q) => q.trim()).filter(Boolean)
  if (active.length === 0) return true
  const haystack = jobTitleHaystack(job)
  return active.some((q) => textMatchesQueryTokens(haystack, q))
}

export function jobMatchesSearchCriteria(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  query: string,
  selectedTags: AppTag[],
  excludedTags: AppTag[] = [],
): boolean {
  if (!jobMatchesAnySearchQuery(job, [query])) return false
  if (jobMatchesExcludedTags(job, excludedTags)) return false
  return jobMatchesSelectedTags(job, selectedTags)
}

export function matchingCatalogTags(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  catalog: AppTag[],
): AppTag[] {
  if (catalog.length === 0) return []
  const prepared = prepareJobTagMatch(job, { maxDescriptionChars: 1200 })
  return catalog.filter((tag) => tagMatchesJob(tag, job, prepared))
}

export function mergeBuiltinTags(stored?: AppTag[] | null): AppTag[] {
  if (!Array.isArray(stored) || stored.length === 0) {
    return BUILTIN_TAGS.map((tag) => ({ ...tag }))
  }

  const byId = new Map<string, AppTag>()
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const label = typeof raw.label === 'string' ? raw.label.trim() : ''
    if (!id || !label) continue
    byId.set(id, {
      id,
      label,
      kind:
        raw.kind === 'workplace' || raw.kind === 'contract'
          ? raw.kind
          : 'custom',
      builtin: Boolean(raw.builtin),
    })
  }

  for (const builtin of BUILTIN_TAGS) {
    if (byId.has(builtin.id)) byId.set(builtin.id, { ...builtin })
  }

  const builtins = BUILTIN_TAGS.filter((t) => byId.has(t.id)).map(
    (t) => byId.get(t.id)!,
  )
  const customs = [...byId.values()].filter((t) => !BUILTIN_TAGS.some((b) => b.id === t.id))
  return [...builtins, ...customs]
}

export function findTagByLabel(
  catalog: AppTag[],
  label: string,
): AppTag | undefined {
  const needle = normalizeTagLabel(label)
  if (!needle) return undefined
  return catalog.find((t) => normalizeTagLabel(t.label) === needle)
}
