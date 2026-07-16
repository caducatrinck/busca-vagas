import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  containsWholeWord,
  matchesQuickFilter,
  titleMatchesQuery,
} from './filterJobs.ts'

describe('containsWholeWord', () => {
  it('casa palavra inteira', () => {
    assert.equal(containsWholeWord('React Senior Engineer', 'React'), true)
  })

  it('não casa substring no meio da palavra', () => {
    assert.equal(containsWholeWord('Reactive Systems', 'React'), false)
  })
})

describe('matchesQuickFilter', () => {
  it('java/javascript usam palavra inteira', () => {
    assert.equal(matchesQuickFilter('Javascript Senior', 'Java'), false)
    assert.equal(matchesQuickFilter('JavaScript Engineer', 'Java'), false)
    assert.equal(matchesQuickFilter('Java Developer', 'Java'), true)
    assert.equal(matchesQuickFilter('Software Engineer (Java)', 'Java'), true)
    assert.equal(matchesQuickFilter('JavaScript Engineer', 'Javascript'), true)
    assert.equal(matchesQuickFilter('Java Developer', 'Javascript'), false)
  })

  it('demais termos usam substring', () => {
    assert.equal(matchesQuickFilter('Reactive Systems', 'React'), true)
    assert.equal(matchesQuickFilter('Frontend Engineer', 'front'), true)
    assert.equal(matchesQuickFilter('Backend Engineer', 'front'), false)
  })
})

describe('titleMatchesQuery', () => {
  it('exige todos os tokens', () => {
    assert.equal(titleMatchesQuery('React Senior', 'React Senior'), true)
    assert.equal(titleMatchesQuery('React Junior', 'React Senior'), false)
  })
})
