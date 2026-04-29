import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import postgres from 'postgres'
import * as schema from './schema'

export function createDb() {
  if (process.env.NODE_ENV === 'production') {
    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production')
    }

    const client = postgres(databaseUrl)

    return drizzlePostgres(client, { schema })
  }

  const dataDir = process.env.PGLITE_DATA_DIR ?? '.pglite/dev'

  mkdirSync(dirname(dataDir), { recursive: true })

  const client = new PGlite(dataDir)

  return drizzlePglite(client, { schema })
}

export type Db = ReturnType<typeof createDb>

export const db = createDb()
