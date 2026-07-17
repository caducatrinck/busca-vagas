import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import type { Job, WorkplaceType } from '../../types.js'
import { LINKEDIN_BASE } from './client.js'

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** IDs oficiais do LinkedIn: 1=presencial, 2=remoto, 3=híbrido */
export const WORKPLACE_TYPE_BY_URN_ID: Record<string, WorkplaceType> = {
  '1': 'onsite',
  '2': 'remote',
  '3': 'hybrid',
}

export function parseWorkplaceFromVoyagerPayload(
  payload: unknown,
): WorkplaceType | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const root = payload as {
    data?: { workplaceTypes?: unknown; workRemoteAllowed?: unknown }
    included?: unknown[]
  }

  const urns = root.data?.workplaceTypes
  if (Array.isArray(urns)) {
    for (const urn of urns) {
      if (typeof urn !== 'string') continue
      const id = urn.match(/fs_workplaceType:(\d+)/)?.[1]
      if (id && WORKPLACE_TYPE_BY_URN_ID[id]) return WORKPLACE_TYPE_BY_URN_ID[id]
    }
  }

  if (Array.isArray(root.included)) {
    for (const item of root.included) {
      if (!item || typeof item !== 'object') continue
      const rec = item as { entityUrn?: string; localizedName?: string }
      const id = rec.entityUrn?.match(/fs_workplaceType:(\d+)/)?.[1]
      if (id && WORKPLACE_TYPE_BY_URN_ID[id]) return WORKPLACE_TYPE_BY_URN_ID[id]
      if (typeof rec.localizedName === 'string') {
        const tag = parseWorkplaceTag(rec.localizedName)
        if (tag) return tag
      }
    }
  }

  if (root.data?.workRemoteAllowed === true) return 'remote'
  return undefined
}

export function parseDescriptionFromVoyagerPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const data = (payload as { data?: { description?: unknown } }).data
  const desc = data?.description
  if (!desc) return ''
  if (typeof desc === 'string') return desc.replace(/\s+/g, ' ').trim()
  if (typeof desc === 'object' && desc !== null && 'text' in desc) {
    const text = (desc as { text?: unknown }).text
    if (typeof text === 'string') return text.replace(/\s+/g, ' ').trim()
  }
  return ''
}

/** Só aceita o texto da tag em si (Híbrido / Presencial / Remoto), não trechos de título/local. */
export function parseWorkplaceTag(text: string): WorkplaceType | undefined {
  const n = normalizeForMatch(text)
  if (!n) return undefined

  if (
    n === 'hibrido' ||
    n === 'hibrida' ||
    n === 'hybrid' ||
    n === 'modelo hibrido'
  ) {
    return 'hybrid'
  }
  if (n === 'remoto' || n === 'remote' || n === 'work from home' || n === 'wfh') {
    return 'remote'
  }
  if (
    n === 'presencial' ||
    n === 'on-site' ||
    n === 'onsite' ||
    n === 'on site' ||
    n === 'in-person' ||
    n === 'in person' ||
    n === 'in-office' ||
    n === 'in office'
  ) {
    return 'onsite'
  }
  return undefined
}

/** @deprecated use parseWorkplaceTag */
export function inferWorkplaceType(text: string): WorkplaceType | undefined {
  return parseWorkplaceTag(text)
}

function isWorkplaceCriteriaHeader(header: string): boolean {
  return /workplace|modelo de trabalho|tipo de local|work type|local de trabalho|formato de trabalho/.test(
    header,
  )
}

/** Extrai só a tag de modelo de trabalho do HTML de detalhe (não título/local). */
export function parseWorkplaceTypeFromDetail(
  $: cheerio.CheerioAPI,
): WorkplaceType | undefined {
  const criteriaItems = $('.description__job-criteria-item')
  for (let i = 0; i < criteriaItems.length; i++) {
    const item = criteriaItems.eq(i)
    const header = normalizeForMatch(
      item.find('.description__job-criteria-subheader').first().text(),
    )
    const value = item
      .find('.description__job-criteria-text')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()

    if (isWorkplaceCriteriaHeader(header)) {
      const fromHeader = parseWorkplaceTag(value)
      if (fromHeader) return fromHeader
    }

    const exact = parseWorkplaceTag(value)
    if (exact) return exact
  }

  // Pills com classe de workplace no HTML guest
  const workplaceEls = $('[class*="workplace-type"]')
  for (let i = 0; i < workplaceEls.length; i++) {
    const text = workplaceEls.eq(i).text().replace(/\s+/g, ' ').trim()
    const tag = parseWorkplaceTag(text)
    if (tag) return tag
  }

  return undefined
}

export function parseJobId(card: cheerio.Cheerio<Element>, href: string): string {
  const urn = card.attr('data-entity-urn') || ''
  const fromUrn = urn.match(/jobPosting:(\d+)/)?.[1]
  if (fromUrn) return fromUrn

  const fromHref =
    href.match(/\/jobs\/view\/[^/]+-(\d+)/)?.[1] ||
    href.match(/currentJobId=(\d+)/)?.[1]
  return fromHref || href
}

/**
 * Lê o <time> do card LinkedIn.
 * - postedLabel: texto exato da UI ("há 8 horas", "Compartilhada há 4 horas")
 * - postedAt: ISO absoluto quando o texto é relativo; senão o datetime (às vezes só YYYY-MM-DD)
 */
export function extractPostedAt(
  card: cheerio.Cheerio<Element>,
  now = Date.now(),
): { postedAt?: string; postedLabel?: string } {
  const timeEl = card.find('time').first()
  if (!timeEl.length) return {}

  const datetime = (timeEl.attr('datetime') || '').trim()
  const text = timeEl.text().replace(/\s+/g, ' ').trim()
  const postedLabel = text || undefined

  const relativeMs = text ? parseRelativePostedMs(text) : null
  if (relativeMs != null) {
    return {
      postedAt: new Date(now - relativeMs).toISOString(),
      postedLabel,
    }
  }
  if (datetime) return { postedAt: datetime, postedLabel }
  if (text) return { postedAt: text, postedLabel }
  return {}
}

function parseRelativePostedMs(text: string): number | null {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (
    /\b(agora|just now|right now|moments? ago|ha poucos (segundos|instantes))\b/.test(
      normalized,
    )
  ) {
    return 0
  }
  if (/\b(ontem|yesterday)\b/.test(normalized)) return 86_400_000

  const match =
    normalized.match(
      /\bha\s+(\d+)\s+(minutos?|horas?|dias?|semanas?|meses?|anos?)\b/,
    ) ||
    normalized.match(
      /\b(\d+)\s+(minutos?|horas?|dias?|semanas?|meses?|anos?)\s+atras\b/,
    ) ||
    normalized.match(
      /\b(\d+)\s+(minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/,
    )

  if (!match) return null
  return relativeAmountToMs(Number(match[1]), match[2])
}

function relativeAmountToMs(amount: number, unitRaw: string): number {
  const unit = unitRaw.toLowerCase()
  if (unit.startsWith('min')) return amount * 60_000
  if (unit.startsWith('hour') || unit.startsWith('hora')) {
    return amount * 3_600_000
  }
  if (unit.startsWith('day') || unit.startsWith('dia')) {
    return amount * 86_400_000
  }
  if (unit.startsWith('week') || unit.startsWith('semana')) {
    return amount * 604_800_000
  }
  if (unit.startsWith('month') || unit.startsWith('mes')) {
    return amount * 2_592_000_000
  }
  if (unit.startsWith('year') || unit.startsWith('ano')) {
    return amount * 31_536_000_000
  }
  return amount * 60_000
}

export function parseJobsFromSearchHtml(html: string): Job[] {
  const $ = cheerio.load(html)
  const jobs: Job[] = []
  const seen = new Set<string>()

  $('div.base-search-card, li').each((_: number, el) => {
    const card = $(el)
    if (!card.attr('data-entity-urn')?.includes('jobPosting')) return

    const link = card.find('a.base-card__full-link').first()
    let href = link.attr('href') || ''
    if (href.startsWith('/')) href = `${LINKEDIN_BASE}${href}`

    const title = card.find('.base-search-card__title').first().text().replace(/\s+/g, ' ').trim()
    const company = card
      .find('.base-search-card__subtitle')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    const location = card
      .find('.job-search-card__location')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    const { postedAt, postedLabel } = extractPostedAt(card)

    const id = parseJobId(card, href)
    if (!title || seen.has(id)) return
    seen.add(id)

    jobs.push({
      id,
      title,
      company,
      location,
      description: '',
      url: href.split('?')[0] || href,
      postedAt,
      postedLabel,
    })
  })

  return jobs
}

export function parseJobDetailHtml(html: string): {
  description: string
  workplaceType?: WorkplaceType
} {
  const $ = cheerio.load(html)
  const text =
    $('.show-more-less-html__markup').first().text() ||
    $('.description__text').first().text() ||
    $('.decorated-job-posting__details').first().text()

  const description = text.replace(/\s+/g, ' ').trim()
  const workplaceType = parseWorkplaceTypeFromDetail($)

  return { description, workplaceType }
}

/** @deprecated use parseJobDetailHtml */
export function parseJobDescriptionHtml(html: string): string {
  return parseJobDetailHtml(html).description
}
