import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  rmSync,
  utimesSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, before, after } from 'node:test'
import { pruneLogFiles } from './logger.js'

describe('pruneLogFiles', () => {
  let tmp: string
  let prev: string | undefined

  before(() => {
    tmp = path.join(os.tmpdir(), `busca-vagas-logs-${Date.now()}`)
    mkdirSync(path.join(tmp, 'logs'), { recursive: true })
    prev = process.env.BUSCA_VAGAS_DATA_DIR
    process.env.BUSCA_VAGAS_DATA_DIR = tmp
  })

  after(() => {
    if (prev === undefined) delete process.env.BUSCA_VAGAS_DATA_DIR
    else process.env.BUSCA_VAGAS_DATA_DIR = prev
    rmSync(tmp, { recursive: true, force: true })
  })

  it('remove os .log mais antigos quando passa do teto', () => {
    const logs = path.join(tmp, 'logs')
    const chunk = Buffer.alloc(1024, 97)
    for (let i = 0; i < 5; i++) {
      const file = path.join(logs, `old-${i}.log`)
      writeFileSync(file, chunk)
      const past = new Date(Date.now() - (5 - i) * 60_000)
      utimesSync(file, past, past)
    }
    writeFileSync(path.join(logs, 'app.log'), chunk)

    pruneLogFiles(3 * 1024)

    const left = readdirSync(logs).filter((n) => n.endsWith('.log')).sort()
    assert.ok(left.includes('app.log'))
    assert.ok(left.length <= 3)
    assert.equal(existsSync(path.join(logs, 'old-0.log')), false)
  })
})
