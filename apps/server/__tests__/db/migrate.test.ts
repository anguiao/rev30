import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDb } from '../../src/db/index'
import { migratePGlite } from '../../src/db/migrate'
import { systemResources, systemUsers } from '../../src/db/schema'
import * as schema from '../../src/db/schema'

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

describe('PGlite migration runner', () => {
  afterEach(async () => {
    restoreEnv('NODE_ENV', originalNodeEnv)
    restoreEnv('PGLITE_DATA_DIR', originalPgliteDataDir)

    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('applies packaged migrations to a fresh PGlite database', async () => {
    const client = new PGlite()

    try {
      await migratePGlite(client)

      const database = drizzle(client, { schema })
      const now = new Date()
      const [createdUser] = await database
        .insert(systemUsers)
        .values({
          id: randomUUID(),
          username: 'migrated-user',
          nickname: 'Migrated User',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      const [systemResource] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.code, 'system'))

      expect(createdUser?.builtIn).toBe(false)
      expect(systemResource).toMatchObject({
        code: 'system',
        name: '系统管理',
      })

      await client.query(
        `
          insert into "auth_login_attempt_buckets"
            ("username", "failed_count", "window_started_at", "last_failed_at", "created_at", "updated_at")
          values
            ('migrated-login-attempt', 1, now(), now(), now(), now())
        `,
      )
    } finally {
      await client.close()
    }
  }, 10_000)

  it('migrates development PGlite databases before returning from createDb', async () => {
    const dataDir = join(await createTempDir(), 'dev')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const { close, db: database } = await createDb()

    try {
      const [systemResource] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.code, 'system'))

      expect(systemResource?.name).toBe('系统管理')
    } finally {
      await close()
    }
  })
})
