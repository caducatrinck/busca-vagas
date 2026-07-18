import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatPostedAt, jobRecencyMs, parsePostedAt } from './formatPostedAt.ts'

describe('formatPostedAt', () => {
  const now = Date.parse('2026-07-16T19:57:00-03:00')

  it('data só-dia de hoje vira "hoje", não horas desde meia-noite', () => {
    assert.equal(formatPostedAt('2026-07-16', now), 'hoje')
  })

  it('data só-dia de ontem vira "ontem"', () => {
    assert.equal(formatPostedAt('2026-07-15', now), 'ontem')
  })

  it('parseia "há N horas" e "Compartilhada há N horas"', () => {
    assert.equal(formatPostedAt('há 8 horas', now), 'há 8 horas')
    assert.equal(formatPostedAt('Compartilhada há 4 horas', now), 'há 4 horas')
  })

  it('formata ISO absoluto no estilo LinkedIn', () => {
    const eightHoursAgo = new Date(now - 8 * 3_600_000).toISOString()
    assert.equal(formatPostedAt(eightHoursAgo, now), 'há 8 horas')
    const minsAgo = new Date(now - 37 * 60_000).toISOString()
    assert.equal(formatPostedAt(minsAgo, now), 'há 37 minutos')
  })

  it('locale en: data só-dia e relativo PT parseável', () => {
    assert.equal(formatPostedAt('2026-07-16', now, 'en'), 'today')
    assert.equal(formatPostedAt('há 8 horas', now, 'en'), '8 hours ago')
  })
})

describe('parsePostedAt', () => {
  const now = Date.parse('2026-07-16T19:57:00-03:00')

  it('relativo com prefixo', () => {
    const ms = parsePostedAt('Compartilhada há 4 horas', now)
    assert.ok(ms != null)
    assert.equal(Math.round((now - ms!) / 3_600_000), 4)
  })
})

describe('jobRecencyMs', () => {
  const now = Date.parse('2026-07-16T19:57:00-03:00')

  it('ordena relativo mais novo acima de data só-dia antiga', () => {
    const newer = jobRecencyMs({ postedAt: 'há 4 horas' }, now)
    const older = jobRecencyMs({ postedAt: '2026-07-14' }, now)
    assert.ok(newer > older)
  })
})
