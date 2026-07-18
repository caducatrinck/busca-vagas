import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampIntervalMinutes,
  isCooldownErrorMessage,
  POSTED_WITHIN_VALUES,
} from './constants.ts'
import { formatCountdown, tabCountdownLabel } from './formatCountdown.ts'

describe('clampIntervalMinutes', () => {
  it('limita entre 1 e 120', () => {
    assert.equal(clampIntervalMinutes(0), 1)
    assert.equal(clampIntervalMinutes(200), 120)
    assert.equal(clampIntervalMinutes(20), 20)
  })

  it('cai em 20 se NaN', () => {
    assert.equal(clampIntervalMinutes(Number.NaN), 20)
  })
})

describe('isCooldownErrorMessage', () => {
  it('reconhece mensagens de cooldown', () => {
    assert.equal(isCooldownErrorMessage('Aguarde 15s entre buscas'), true)
    assert.equal(
      isCooldownErrorMessage('Pausa de 29s entre buscas (anti-spam local).'),
      true,
    )
    assert.equal(isCooldownErrorMessage('Cookie inválido'), false)
  })
})

describe('POSTED_WITHIN_VALUES', () => {
  it('tem as janelas curtas novas', () => {
    assert.ok(POSTED_WITHIN_VALUES.includes('30m'))
    assert.ok(POSTED_WITHIN_VALUES.includes('1h'))
    assert.ok(POSTED_WITHIN_VALUES.includes('10h'))
  })
})

describe('formatCountdown', () => {
  it('formata mm:ss', () => {
    assert.equal(formatCountdown(65_000), '01:05')
  })

  it('formata h:mm:ss', () => {
    assert.equal(formatCountdown(3_661_000), '1:01:01')
  })
})

describe('tabCountdownLabel', () => {
  it('mostra buscando quando running', () => {
    assert.equal(tabCountdownLabel(null, Date.now(), true), 'buscando')
  })

  it('mostra agora se nextRunAt passou', () => {
    const now = Date.now()
    assert.equal(
      tabCountdownLabel(new Date(now - 1000).toISOString(), now, false),
      'agora',
    )
  })

  it('usa inglês quando locale=en', () => {
    assert.equal(tabCountdownLabel(null, Date.now(), true, 'en'), 'searching')
  })
})
