import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema'
import { applyPgliteMigrations } from '../db/migrations'

export async function createTestDb() {
  const client = new PGlite()

  await applyPgliteMigrations(client)

  return drizzle(client, { schema })
}
