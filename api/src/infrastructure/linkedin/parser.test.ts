import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseWorkplaceTag,
  parseWorkplaceFromVoyagerPayload,
  parseJobDetailHtml,
  parseJobsFromSearchHtml,
} from './parser.js'

describe('parseWorkplaceTag', () => {
  it('só aceita o texto exato da tag', () => {
    assert.equal(parseWorkplaceTag('Híbrido'), 'hybrid')
    assert.equal(parseWorkplaceTag('Hybrid'), 'hybrid')
    assert.equal(parseWorkplaceTag('Presencial'), 'onsite')
    assert.equal(parseWorkplaceTag('Remoto'), 'remote')
    assert.equal(parseWorkplaceTag('Remote'), 'remote')
  })

  it('não infere a partir de título ou local', () => {
    assert.equal(parseWorkplaceTag('100% remoto | Dev Sênior'), undefined)
    assert.equal(parseWorkplaceTag('São Paulo, SP'), undefined)
    assert.equal(parseWorkplaceTag('Brasil (Remoto)'), undefined)
    assert.equal(parseWorkplaceTag('Tempo integral'), undefined)
  })
})

describe('parseJobsFromSearchHtml', () => {
  it('não define workplaceType na listagem (só na tag do detalhe)', () => {
    const html = `
      <div class="base-search-card" data-entity-urn="urn:li:jobPosting:123">
        <a class="base-card__full-link" href="/jobs/view/foo-123"></a>
        <h3 class="base-search-card__title">100% remoto | Dev</h3>
        <h4 class="base-search-card__subtitle">Acme</h4>
        <span class="job-search-card__location">Brasil (Remoto)</span>
      </div>
    `
    const jobs = parseJobsFromSearchHtml(html)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0]?.workplaceType, undefined)
  })
})

describe('parseWorkplaceFromVoyagerPayload', () => {
  it('mapeia urn fs_workplaceType 1/2/3', () => {
    assert.equal(
      parseWorkplaceFromVoyagerPayload({
        data: { workplaceTypes: ['urn:li:fs_workplaceType:2'] },
      }),
      'remote',
    )
    assert.equal(
      parseWorkplaceFromVoyagerPayload({
        data: { workplaceTypes: ['urn:li:fs_workplaceType:1'] },
      }),
      'onsite',
    )
    assert.equal(
      parseWorkplaceFromVoyagerPayload({
        data: { workplaceTypes: ['urn:li:fs_workplaceType:3'] },
      }),
      'hybrid',
    )
  })
})

describe('parseJobDetailHtml', () => {
  it('lê a tag nos critérios da vaga', () => {
    const html = `
      <div class="show-more-less-html__markup">Descrição da vaga</div>
      <ul class="description__job-criteria-list">
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Employment type</h3>
          <span class="description__job-criteria-text">Full-time</span>
        </li>
        <li class="description__job-criteria-item">
          <h3 class="description__job-criteria-subheader">Workplace type</h3>
          <span class="description__job-criteria-text">Hybrid</span>
        </li>
      </ul>
    `
    const detail = parseJobDetailHtml(html)
    assert.equal(detail.description, 'Descrição da vaga')
    assert.equal(detail.workplaceType, 'hybrid')
  })
})
