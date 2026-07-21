import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUILTIN_TAGS,
  jobMatchesSearchCriteria,
  textMatchesQueryTokens,
} from '../../../shared/tags.js'
import type { Job } from '../../../shared/domain.js'

describe('textMatchesQueryTokens', () => {
  it('ignora ordem das palavras', () => {
    assert.equal(textMatchesQueryTokens('Senior React Engineer', 'React Senior'), true)
    assert.equal(textMatchesQueryTokens('React Junior', 'React Senior'), false)
  })
})

describe('jobMatchesSearchCriteria', () => {
  const job: Job = {
    id: '1',
    title: 'Senior React Developer',
    company: 'Acme',
    location: 'Brasil',
    description: 'Contratação CLT. Trabalho remoto.',
    url: 'https://example.com',
    workplaceType: 'remote',
    contractTags: ['CLT'],
  }

  it('aceita query sem ordem + tag OR', () => {
    const clt = BUILTIN_TAGS.find((t) => t.id === 'CLT')!
    assert.equal(
      jobMatchesSearchCriteria(job, 'React Senior', [clt]),
      true,
    )
  })

  it('descarta se nenhuma tag OR casar', () => {
    const pj = BUILTIN_TAGS.find((t) => t.id === 'PJ')!
    assert.equal(jobMatchesSearchCriteria(job, 'React Senior', [pj]), false)
  })

  it('sem tags selecionadas só exige a query', () => {
    assert.equal(jobMatchesSearchCriteria(job, 'React Senior', []), true)
  })

  it('rejeita se tag de exclusão casar', () => {
    const clt = BUILTIN_TAGS.find((t) => t.id === 'CLT')!
    assert.equal(
      jobMatchesSearchCriteria(job, 'React Senior', [], [clt]),
      false,
    )
  })
})
