import {
  parseContractTags,
  resolveWorkplaceType,
  type Job,
  type WorkplaceType,
} from './domain.js'

export const MAX_TAG_LABEL_LENGTH = 32

/** @deprecated Sem limite de catálogo; mantido só por compat de imports antigos. */
export const MAX_APP_TAGS = Number.POSITIVE_INFINITY

export type AppTagKind = 'workplace' | 'contract' | 'custom'

export type AppTag = {
  id: string
  label: string
  kind: AppTagKind
  builtin: boolean
}

/** Defaults do app (podem ser removidos pelo usuário). */
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function containsWholeWord(haystack: string, needle: string): boolean {
  const n = normalizeTagLabel(needle)
  if (!n) return false
  const h = normalizeTagLabel(haystack)
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(n)}(?![\\p{L}\\p{N}_])`,
    'u',
  )
  return re.test(h)
}

/** Tokens da query: ordem irrelevante, todos precisam aparecer (AND). */
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
): boolean {
  const haystack = jobSearchHaystack(job)

  if (tag.kind === 'workplace') {
    const wanted = WORKPLACE_BY_TAG_ID[tag.id]
    if (wanted) {
      const resolved = resolveWorkplaceType(job.workplaceType, job.description)
      if (resolved === wanted) return true
      return WORKPLACE_ALIASES[wanted].some((alias) =>
        containsWholeWord(haystack, alias),
      )
    }
  }

  if (tag.kind === 'contract') {
    const contracts =
      job.contractTags?.length
        ? job.contractTags
        : parseContractTags(job.description ?? '')
    if (contracts.includes(tag.label as 'CLT' | 'PJ')) return true
    return containsWholeWord(haystack, tag.label)
  }

  return containsWholeWord(haystack, tag.label)
}

/** OR: pelo menos uma tag selecionada precisa casar. Sem seleção = passa. */
export function jobMatchesSelectedTags(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  selectedTags: AppTag[],
): boolean {
  if (selectedTags.length === 0) return true
  return selectedTags.some((tag) => tagMatchesJob(tag, job))
}

/** OR: se qualquer tag de exclusão casar, a vaga é rejeitada. Sem seleção = passa. */
export function jobMatchesExcludedTags(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  excludedTags: AppTag[],
): boolean {
  if (excludedTags.length === 0) return false
  return excludedTags.some((tag) => tagMatchesJob(tag, job))
}

/**
 * Critério de aceite na busca/polling:
 * - query: todas as palavras no título (ordem irrelevante)
 * - include tags: OR em título+descrição (vazio = todas)
 * - exclude tags: OR — se qualquer casar, rejeita
 */
export function jobMatchesSearchCriteria(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  query: string,
  selectedTags: AppTag[],
  excludedTags: AppTag[] = [],
): boolean {
  if (!textMatchesQueryTokens(jobTitleHaystack(job), query)) return false
  if (jobMatchesExcludedTags(job, excludedTags)) return false
  return jobMatchesSelectedTags(job, selectedTags)
}

export function matchingCatalogTags(
  job: Pick<Job, 'title' | 'description' | 'workplaceType' | 'contractTags'>,
  catalog: AppTag[],
): AppTag[] {
  return catalog.filter((tag) => tagMatchesJob(tag, job))
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

  // Reaplica definição oficial se a tag padrão ainda existir no store.
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
