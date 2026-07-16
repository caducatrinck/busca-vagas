import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { containsWholeWord, titleMatchesQuery } from './filterJobs.ts'

describe('containsWholeWord', () => {
  it('casa palavra inteira', () => {
    assert.equal(containsWholeWord('React Senior Engineer', 'React'), true)
  })

  it('não casa substring no meio da palavra', () => {
    assert.equal(containsWholeWord('Reactive Systems', 'React'), false)
  })
})

describe('titleMatchesQuery', () => {
  it('exige todos os tokens', () => {
    assert.equal(titleMatchesQuery('React Senior', 'React Senior'), true)
    assert.equal(titleMatchesQuery('React Junior', 'React Senior'), false)
  })
})
