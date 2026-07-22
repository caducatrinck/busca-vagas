import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUILTIN_TAGS,
  jobMatchesAnySearchQuery,
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

describe('jobMatchesAnySearchQuery', () => {
  it('só olha o titulo (Senior na descricao nao basta)', () => {
    const job: Job = {
      id: '4443939897',
      title: 'Fullstack React | Typrescript | MongoDB',
      company: 'hub xp',
      location: 'Brasil',
      description:
        'Buscamos Desenvolvedores(as) Fullstack Sênior. Stack Node.js, TypeScript, React. PJ 100% Remoto',
      url: 'https://example.com',
      workplaceType: 'remote',
      contractTags: ['PJ'],
    }
    assert.equal(
      jobMatchesAnySearchQuery(job, ['Fullstack Senior']),
      false,
    )
  })

  it('aceita se qualquer busca do pooling casar no titulo', () => {
    const job: Job = {
      id: '2',
      title: 'React Senior Engineer',
      company: 'Acme',
      location: 'Brasil',
      description: 'Vaga qualquer',
      url: 'https://example.com',
      workplaceType: 'remote',
      contractTags: [],
    }
    assert.equal(
      jobMatchesAnySearchQuery(job, ['Fullstack Senior', 'React Senior']),
      true,
    )
  })

  it('rejeita se nenhuma busca casar no titulo', () => {
    const job: Job = {
      id: '3',
      title: 'Java Developer',
      company: 'Acme',
      location: 'Brasil',
      description: 'Backend Java e Spring Senior',
      url: 'https://example.com',
      workplaceType: 'onsite',
      contractTags: ['CLT'],
    }
    assert.equal(
      jobMatchesAnySearchQuery(job, ['Fullstack Senior', 'React Senior']),
      false,
    )
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
