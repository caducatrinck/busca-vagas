import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  STAGGER_MS,
  resolveStaggeredSlot,
  scheduledRunAt,
} from './runtime.js'

describe('resolveStaggeredSlot', () => {
  beforeEach(() => {
    scheduledRunAt.clear()
  })

  it('não dispara todos os overdue no mesmo segundo', () => {
    const overdue = Date.now() - 60 * 60 * 1000
    const a = resolveStaggeredSlot('a', overdue)
    scheduledRunAt.set('a', a)
    const b = resolveStaggeredSlot('b', overdue)
    scheduledRunAt.set('b', b)
    const c = resolveStaggeredSlot('c', overdue)

    assert.ok(a >= Date.now())
    assert.ok(b >= a + STAGGER_MS - 60_000)
    assert.ok(c >= b + STAGGER_MS - 60_000)
    assert.notEqual(Math.floor(a / 60_000), Math.floor(b / 60_000))
    assert.notEqual(Math.floor(b / 60_000), Math.floor(c / 60_000))
  })
})
