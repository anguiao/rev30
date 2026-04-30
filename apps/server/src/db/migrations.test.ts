import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { users } from './schema'
import { createDb } from './index'
import { applyPgliteMigrations } from './migrations'

const originalNodeEnv = process.env.NODE_ENV
const originalPgliteDataDir = process.env.PGLITE_DATA_DIR
const tempDirs: string[] = []

async function createTempDir() {
  const directory = await mkdtemp(join(tmpdir(), 'rev30-pglite-'))

  tempDirs.push(directory)

  return directory
}

function restoreEnv(key: 'NODE_ENV' | 'PGLITE_DATA_DIR', value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

describe('PGlite migrations', () => {
  afterEach(async () => {
    restoreEnv('NODE_ENV', originalNodeEnv)
    restoreEnv('PGLITE_DATA_DIR', originalPgliteDataDir)

    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('runs every SQL migration in order', async () => {
    const migrationsDir = await createTempDir()
    const client = new PGlite()

    await writeFile(
      join(migrationsDir, '0000_create_widgets.sql'),
      'create table widgets (name text not null);',
    )
    await writeFile(
      join(migrationsDir, '0001_insert_widgets.sql'),
      "insert into widgets (name) values ('first'), ('second');",
    )

    await applyPgliteMigrations(client, migrationsDir)

    const result = await client.query<{ name: string }>('select name from widgets order by name')

    expect(result.rows).toEqual([{ name: 'first' }, { name: 'second' }])

    await client.close()
  })

  it('creates a usable users table for fresh development databases', async () => {
    const dataDir = join(await createTempDir(), 'dev')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const database = await createDb()
    const rows = await database.select().from(users).limit(1)

    expect(rows).toEqual([])
  })
})
