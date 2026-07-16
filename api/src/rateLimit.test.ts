import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SearchRateLimiter } from './rateLimit.js'

describe('SearchRateLimiter', () => {
  it('permite a primeira busca', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 1000,
      maxPerHour: 10,
      maxPerDay: 100,
    })
    const snap = limiter.snapshot(1_000_000)
    assert.equal(snap.allowed, true)
  })

  it('bloqueia pelo cooldown entre buscas', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 30_000,
      maxPerHour: 10,
      maxPerDay: 100,
    })
    const t0 = 1_000_000
    limiter.recordSearch(t0)
    const snap = limiter.snapshot(t0 + 5_000)
    assert.equal(snap.allowed, false)
    assert.match(snap.reason ?? '', /Cota local/)
  })

  it('bloqueia ao atingir o limite horário', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 0,
      maxPerHour: 2,
      maxPerDay: 100,
    })
    const t0 = 1_000_000
    limiter.recordSearch(t0)
    limiter.recordSearch(t0 + 1)
    const snap = limiter.snapshot(t0 + 2)
    assert.equal(snap.allowed, false)
    assert.match(snap.reason ?? '', /limite horário/i)
  })
})
