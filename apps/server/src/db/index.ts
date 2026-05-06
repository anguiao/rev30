import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { mkdir } from 'node:fs/promises'
import postgres from 'postgres'
import { applyPgliteMigrations } from './migrations'
import * as schema from './schema'

export type DbCloser = () => Promise<void>

export async function createManagedDb() {
  if (process.env.NODE_ENV === 'production') {
    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      throw new Error('生产环境必须设置 DATABASE_URL')
    }

    const client = postgres(databaseUrl)

    return {
      close: async () => {
        await client.end({ timeout: 5 })
      },
      db: drizzlePostgres(client, { schema }),
    }
  }

  const dataDir = process.env.PGLITE_DATA_DIR ?? '.pglite/dev'

  await mkdir(dataDir, { recursive: true })

  const client = new PGlite(dataDir)

  await applyPgliteMigrations(client)

  return {
    close: async () => {
      await client.close()
    },
    db: drizzlePglite(client, { schema }),
  }
}

export async function createDb() {
  const { db } = await createManagedDb()

  return db
}

export type Db = Awaited<ReturnType<typeof createDb>>
export type DbReader = Pick<Db, 'select'>
export type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>
