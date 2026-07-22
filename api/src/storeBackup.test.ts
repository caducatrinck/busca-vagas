import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  backupStoreFile,
  formatBackupStamp,
  listBackupFiles,
  pruneBackups,
  readLatestBackup,
  MAX_BACKUPS,
} from './storeBackup.js'

describe('storeBackup', () => {
  it('formata o carimbo no estilo DIA-3-MES-5-HORA15-43', () => {
    const d = new Date(2026, 4, 3, 15, 43, 7)
    assert.equal(formatBackupStamp(d), 'DIA-3-MES-5-HORA15-43')
  })

  it('cria backup e mantém no máximo 10 versões', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'busca-vagas-bak-'))
    const storePath = path.join(dir, 'store.json')
    const backupDir = path.join(dir, 'backups')
    try {
      await writeFile(
        storePath,
        JSON.stringify({ jobs: { a: { id: 'a' } }, monitors: [] }),
        'utf8',
      )

      for (let i = 0; i < 12; i++) {
        await writeFile(
          storePath,
          JSON.stringify({ jobs: { [`j${i}`]: { id: `j${i}` } }, monitors: [{ id: 'm' }] }),
          'utf8',
        )

        const dest = path.join(
          backupDir,
          `DIA-1-MES-1-HORA0-${String(i).padStart(2, '0')}.json`,
        )
        await mkdir(backupDir, { recursive: true })
        const { copyFile } = await import('node:fs/promises')
        await copyFile(storePath, dest)
        await pruneBackups(backupDir)
      }

      const files = await listBackupFiles(backupDir)
      assert.ok(files.length <= MAX_BACKUPS)
      assert.equal(files.length, MAX_BACKUPS)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('backupStoreFile copia store com dados', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'busca-vagas-bak2-'))
    const storePath = path.join(dir, 'store.json')
    const backupDir = path.join(dir, 'backups')
    try {
      await writeFile(
        storePath,
        JSON.stringify({ jobs: { x: { id: 'x' } }, monitors: [] }),
        'utf8',
      )
      const dest = await backupStoreFile(storePath, backupDir)
      assert.ok(dest)
      const raw = await readFile(dest!, 'utf8')
      assert.match(raw, /"x"/)
      const latest = await readLatestBackup(backupDir)
      assert.ok(latest)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
