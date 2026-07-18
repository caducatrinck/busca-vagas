import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cx } from './cx.ts'

describe('cx', () => {
  it('junta classes truthy', () => {
    assert.equal(cx('a', 'b'), 'a b')
  })

  it('ignora false/null/undefined', () => {
    assert.equal(cx('a', false, null, undefined, 'b'), 'a b')
  })

  it('aceita string vazia como falsy no filter', () => {
    assert.equal(cx('a', '', 'b'), 'a b')
  })
})
