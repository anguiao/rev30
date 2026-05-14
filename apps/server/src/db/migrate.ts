import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { join } from 'node:path'

export const defaultMigrationsDir = join(process.cwd(), 'drizzle')

export async function migratePGlite(client: PGlite, migrationsDir = defaultMigrationsDir) {
  await migrate(drizzle(client), {
    migrationsFolder: migrationsDir,
  })
}
