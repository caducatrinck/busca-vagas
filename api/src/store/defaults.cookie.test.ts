import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCookieValue, isLikelyLinkedInJsessionId } from './defaults.js'

describe('normalizeCookieValue', () => {
  it('remove aspas retas externas', () => {
    assert.equal(
      normalizeCookieValue(
        '"v=1&20230814234638cdbea2a9-7f64-4d3e-8ee4-990fa16f2473AQFQweZJFRVLtJyZwXoCr32kISL-GrGh"',
      ),
      'v=1&20230814234638cdbea2a9-7f64-4d3e-8ee4-990fa16f2473AQFQweZJFRVLtJyZwXoCr32kISL-GrGh',
    )
  })

  it('remove aspas tipográficas e espaços', () => {
    assert.equal(normalizeCookieValue('  “ajax:123”  '), 'ajax:123')
  })

  it('não altera valor sem aspas externas', () => {
    assert.equal(normalizeCookieValue('ajax:abc"def'), 'ajax:abc"def')
  })

  it('reconhece JSESSIONID ajax:', () => {
    assert.equal(isLikelyLinkedInJsessionId('"ajax:12345"'), true)
    assert.equal(isLikelyLinkedInJsessionId('ajax:12345'), true)
    assert.equal(
      isLikelyLinkedInJsessionId(
        '"v=1&20230814234638cdbea2a9-7f64-4d3e-8ee4-990fa16f2473AQFQ"',
      ),
      false,
    )
  })
})
