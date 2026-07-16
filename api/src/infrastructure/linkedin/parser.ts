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
    const postedAt =
      card.find('time').first().attr('datetime') ||
      card.find('time').first().text().trim() ||
      undefined

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
