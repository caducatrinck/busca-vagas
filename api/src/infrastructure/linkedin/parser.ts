import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import type { Job } from '../../types.js'
import { LINKEDIN_BASE } from './client.js'

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

export function parseJobDescriptionHtml(html: string): string {
  const $ = cheerio.load(html)
  const text =
    $('.show-more-less-html__markup').first().text() ||
    $('.description__text').first().text() ||
    $('.decorated-job-posting__details').first().text()

  return text.replace(/\s+/g, ' ').trim()
}
