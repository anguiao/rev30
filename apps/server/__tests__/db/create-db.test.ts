import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createDb } from '../../src/db'
import { systemUsers } from '../../src/db/schema'

describe('development database', () => {
  it('migrates and reopens the configured PGlite data directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rev30-create-db-'))
    const userId = randomUUID()

    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PGLITE_DATA_DIR', join(root, 'database'))

    try {
      const firstConnection = await createDb()

      try {
        await firstConnection.db.insert(systemUsers).values({
          id: userId,
          username: `persisted-user-${userId.slice(0, 8)}`,
          nickname: 'Persisted User',
        })
      } finally {
        await firstConnection.close()
      }

      const secondConnection = await createDb()

      try {
        await expect(
          secondConnection.db.select().from(systemUsers).where(eq(systemUsers.id, userId)),
        ).resolves.toMatchObject([
          {
            id: userId,
            nickname: 'Persisted User',
          },
        ])
      } finally {
        await secondConnection.close()
      }
    } finally {
      vi.unstubAllEnvs()
      await rm(root, { force: true, recursive: true })
    }
  }, 10_000)
})
