import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SearchRateLimiter } from './rateLimit.js'

describe('SearchRateLimiter', () => {
  it('permite a primeira busca', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 1000,
      maxPerHour: 0,
      maxPerDay: 0,
    })
    const snap = limiter.snapshot(1_000_000)
    assert.equal(snap.allowed, true)
  })

  it('bloqueia pelo cooldown entre buscas', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 30_000,
      maxPerHour: 0,
      maxPerDay: 0,
    })
    const t0 = 1_000_000
    limiter.recordSearch(t0)
    const snap = limiter.snapshot(t0 + 5_000)
    assert.equal(snap.allowed, false)
    assert.equal(snap.source, 'cooldown')
    assert.match(snap.reason ?? '', /anti-spam local/i)
  })

  it('não bloqueia por cota horária quando maxPerHour=0', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 0,
      maxPerHour: 0,
      maxPerDay: 0,
    })
    const t0 = 1_000_000
    for (let i = 0; i < 20; i++) limiter.recordSearch(t0 + i)
    const snap = limiter.snapshot(t0 + 20)
    assert.equal(snap.allowed, true)
    assert.equal(snap.usage.remainingThisHour, null)
  })

  it('bloqueia ao atingir limite horário opcional', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 0,
      maxPerHour: 2,
      maxPerDay: 0,
    })
    const t0 = 1_000_000
    limiter.recordSearch(t0)
    limiter.recordSearch(t0 + 1)
    const snap = limiter.snapshot(t0 + 2)
    assert.equal(snap.allowed, false)
    assert.equal(snap.source, 'local-cap')
    assert.match(snap.reason ?? '', /segurança local/i)
  })

  it('bloqueia a partir de erro real do LinkedIn (429 + Retry-After)', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 0,
      maxPerHour: 0,
      maxPerDay: 0,
    })
    const t0 = 1_000_000
    const err = new Error('LinkedIn rate limit (HTTP 429).')
    ;(err as Error & { linkedInStatus?: number; retryAfterMs?: number }).linkedInStatus =
      429
    ;(err as Error & { retryAfterMs?: number }).retryAfterMs = 120_000
    assert.equal(limiter.noteLinkedInError(err, t0), true)
    const snap = limiter.snapshot(t0 + 1_000)
    assert.equal(snap.allowed, false)
    assert.equal(snap.source, 'linkedin')
    assert.ok((snap.retryAfterMs ?? 0) > 100_000)
    assert.equal(snap.usage.lastLinkedInStatus, 429)
  })

  it('ignora erros que não são throttle do LinkedIn', () => {
    const limiter = new SearchRateLimiter({
      minIntervalMs: 0,
      maxPerHour: 0,
      maxPerDay: 0,
    })
    const err = new Error('LinkedIn bloqueou a requisição (HTTP 401).')
    ;(err as Error & { linkedInStatus?: number }).linkedInStatus = 401
    assert.equal(limiter.noteLinkedInError(err), false)
    assert.equal(limiter.snapshot().allowed, true)
  })
})
