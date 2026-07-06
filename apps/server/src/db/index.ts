import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { mkdir } from 'node:fs/promises'
import postgres from 'postgres'
import { migratePGlite } from './migrate'
import * as schema from './schema'

export async function createDb() {
  if (process.env.NODE_ENV === 'production') {
    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      throw new Error('生产环境必须设置 DATABASE_URL')
    }

    const client = postgres(databaseUrl)

    const db = drizzlePostgres(client, { schema })

    return {
      close: async () => {
        await client.end({ timeout: 5 })
      },
      db,
    }
  }

  const dataDir = process.env.PGLITE_DATA_DIR ?? '.pglite/dev'

  await mkdir(dataDir, { recursive: true })

  const client = new PGlite(dataDir)

  await migratePGlite(client)

  const db = drizzlePglite(client, { schema })

  return {
    close: async () => {
      await client.close()
    },
    db,
  }
}

export type ManagedDb = Awaited<ReturnType<typeof createDb>>
export type Db = ManagedDb['db']
export type DbReader = Pick<Db, 'select'>
export type DbExecutor = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>
