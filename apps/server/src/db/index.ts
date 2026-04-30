import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { mkdir } from 'node:fs/promises'
import postgres from 'postgres'
import { applyPgliteMigrations } from './migrations'
import * as schema from './schema'

export async function createDb() {
  if (process.env.NODE_ENV === 'production') {
    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production')
    }

    const client = postgres(databaseUrl)

    return drizzlePostgres(client, { schema })
  }

  const dataDir = process.env.PGLITE_DATA_DIR ?? '.pglite/dev'

  await mkdir(dataDir, { recursive: true })

  const client = new PGlite(dataDir)

  await applyPgliteMigrations(client)

  return drizzlePglite(client, { schema })
}

export type Db = Awaited<ReturnType<typeof createDb>>
