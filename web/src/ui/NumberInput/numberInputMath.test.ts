import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clampNumber, parseNumberInput } from './numberInputMath.ts'

describe('clampNumber', () => {
  it('respeita min e max', () => {
    assert.equal(clampNumber(5, 1, 10), 5)
    assert.equal(clampNumber(-1, 0, 10), 0)
    assert.equal(clampNumber(99, 0, 10), 10)
  })
})

describe('parseNumberInput', () => {
  it('vazio vira fallback', () => {
    assert.equal(parseNumberInput('', 20, 1, 120), 20)
    assert.equal(parseNumberInput('   ', 7, 1, 120), 7)
  })

  it('parseia e clampa', () => {
    assert.equal(parseNumberInput('15', 20, 1, 120), 15)
    assert.equal(parseNumberInput('999', 20, 1, 120), 120)
  })

  it('lixo vira fallback', () => {
    assert.equal(parseNumberInput('abc', 3, 1, 10), 3)
  })
})
