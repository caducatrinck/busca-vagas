import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  containsWholeWord,
  filterJobs,
  matchesQuickFilter,
  titleMatchesQuery,
  titleSearchText,
} from './filterJobs.ts'
import type { Job } from './types.ts'

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

describe('filtro de título com tag de workplace', () => {
  const base: Job = {
    id: '1',
    title: 'Desenvolvedor Full-Stack Sênior',
    company: 'Igma',
    location: 'São Paulo, SP',
    description: '',
    url: 'https://linkedin.com/jobs/view/1',
  }

  it('inclui a tag no texto de busca', () => {
    assert.match(
      titleSearchText({ ...base, workplaceType: 'onsite' }),
      /Presencial/i,
    )
  })

  it('casa query presencial pela tag mesmo sem no título', () => {
    const jobs = filterJobs(
      [{ ...base, workplaceType: 'onsite' }],
      {
        excludeTitle: [],
        includeTitle: [],
        excludeDescription: [],
        includeDescription: [],
        language: '',
      },
      { requireQueryInTitle: 'presencial' },
    )
    assert.equal(jobs.length, 1)
  })

  it('não casa presencial se não houver tag', () => {
    const jobs = filterJobs(
      [base],
      {
        excludeTitle: [],
        includeTitle: [],
        excludeDescription: [],
        includeDescription: [],
        language: '',
      },
      { requireQueryInTitle: 'presencial' },
    )
    assert.equal(jobs.length, 0)
  })

  it('casa CLT/PJ pela tag da descrição', () => {
    const withClt: Job = {
      ...base,
      description: 'Contratação CLT com benefícios.',
      contractTags: ['CLT'],
    }
    const jobs = filterJobs(
      [withClt],
      {
        excludeTitle: [],
        includeTitle: [],
        excludeDescription: [],
        includeDescription: [],
        language: '',
      },
      { requireQueryInTitle: 'CLT' },
    )
    assert.equal(jobs.length, 1)
  })
})
