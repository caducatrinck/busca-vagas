export type PostedWithin = '30m' | '1h' | '10h' | '24h' | 'week' | 'month'


export type JobStatus = 'viewed' | 'applied' | 'discarded'

/** híbrido / presencial / remoto */
export type WorkplaceType = 'hybrid' | 'onsite' | 'remote'

export const WORKPLACE_TYPE_LABELS: Record<WorkplaceType, string> = {
  hybrid: 'Híbrido',
  onsite: 'Presencial',
  remote: 'Remoto',
}

/** CLT ou PJ puxado da descrição */
export type ContractTag = 'CLT' | 'PJ'

/** CLT/PJ como palavra inteira */
export function parseContractTags(text: string): ContractTag[] {
  const hay = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (!hay.trim()) return []

  const tags: ContractTag[] = []
  if (/(?<![\p{L}\p{N}_])clt(?![\p{L}\p{N}_])/u.test(hay)) tags.push('CLT')
  if (/(?<![\p{L}\p{N}_])pj(?![\p{L}\p{N}_])/u.test(hay)) tags.push('PJ')
  return tags
}

/**
 * chute pela descrição quando o LinkedIn não mandou a tag.
 * ordem: híbrido > remoto > presencial
 */
export function inferWorkplaceFromDescription(
  text: string,
): WorkplaceType | undefined {
  const hay = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  if (!hay.trim()) return undefined

  if (
    /(?<![\p{L}\p{N}_])hibrid[oa]?(?![\p{L}\p{N}_])/u.test(hay) ||
    /(?<![\p{L}\p{N}_])hybrid(?![\p{L}\p{N}_])/u.test(hay)
  ) {
    return 'hybrid'
  }
  if (
    /(?<![\p{L}\p{N}_])remoto(?![\p{L}\p{N}_])/u.test(hay) ||
    /(?<![\p{L}\p{N}_])remote(?![\p{L}\p{N}_])/u.test(hay) ||
    /(?<![\p{L}\p{N}_])work from home(?![\p{L}\p{N}_])/u.test(hay)
  ) {
    return 'remote'
  }
  if (
    /(?<![\p{L}\p{N}_])presencial(?![\p{L}\p{N}_])/u.test(hay) ||
    /(?<![\p{L}\p{N}_])on[\s-]?site(?![\p{L}\p{N}_])/u.test(hay)
  ) {
    return 'onsite'
  }
  return undefined
}

/** tag oficial primeiro; senão tenta a descrição */
export function resolveWorkplaceType(
  workplaceType: WorkplaceType | null | undefined,
  description?: string,
): WorkplaceType | undefined {
  if (workplaceType) return workplaceType
  return inferWorkplaceFromDescription(description ?? '')
}

export type Job = {
  id: string
  title: string
  company: string
  location: string
  description: string
  url: string
  /** ISO absoluto quando der pra ter (ordenar / atualizar rótulo) */
  postedAt?: string
  /** texto cru do LinkedIn na coleta ("há 8 horas") */
  postedLabel?: string
  /** tag LinkedIn; null = já olhou e não tinha */
  workplaceType?: WorkplaceType | null
  /** veio do Voyager; store antigo sem isso = reconsultar */
  workplaceResolved?: boolean
  /** CLT/PJ se a descrição falar */
  contractTags?: ContractTag[]
}

export type SearchParams = {
  query: string
  location?: string
  postedWithin?: PostedWithin
  postedWithinSeconds?: number
  fetchDescriptions?: boolean
}

export type SearchProgressPhase =
  | 'listing'
  | 'descriptions'
  | 'saving'
  | 'done'
  | 'error'

export type SearchProgress = {
  phase: SearchProgressPhase
  overallPercent: number
  listing: { current: number; total: number | null }
  descriptions: { current: number; total: number }
  label: string
  message?: string
  startedAt: number
  elapsedMs: number
  etaSeconds: number | null
  cancelled?: boolean
}

export type SearchRunStats = {
  jobCount: number
  newCount: number
  durationMs: number
  finishedAt: string
  cancelled: boolean
  linkedinResponded?: boolean
  listingRequests?: number
  listingPagesWithJobs?: number
  emptyReason?: string
}

export type SearchProgressCallback = (progress: SearchProgress) => void
