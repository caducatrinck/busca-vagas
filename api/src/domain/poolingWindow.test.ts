import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolvePoolingPostedSeconds } from '../domain/poolingWindow.js'

describe('resolvePoolingPostedSeconds', () => {
  it('usa o intervalo quando não há lastRunAt', () => {
    const now = Date.parse('2026-07-16T12:00:00.000Z')
    const sec = resolvePoolingPostedSeconds(20, null, now)
    // coverage 20min + buffer max(10min, 50%*20) = 20+10 = 30min
    assert.equal(sec, 30 * 60)
  })

  it('cresce com o tempo real de espera', () => {
    const now = Date.parse('2026-07-16T12:40:00.000Z')
    const last = '2026-07-16T12:00:00.000Z'
    const sec = resolvePoolingPostedSeconds(20, last, now)
    // waited 40min > interval 20 → coverage 40 + buffer 20 = 60min
    assert.equal(sec, 60 * 60)
  })

  it('respeita o teto de 24h', () => {
    const now = Date.parse('2026-07-18T12:00:00.000Z')
    const last = '2026-07-16T12:00:00.000Z'
    const sec = resolvePoolingPostedSeconds(20, last, now)
    assert.equal(sec, 24 * 60 * 60)
  })
})
