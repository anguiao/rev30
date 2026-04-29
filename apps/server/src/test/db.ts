import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '../db/schema'

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle/0000_add_system_users.sql',
)

export async function createTestDb() {
  const client = new PGlite()
  const migration = await readFile(migrationPath, 'utf8')

  await client.exec(migration)

  return drizzle(client, { schema })
}
