import type { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationTable = '__rev30_migrations'

export const defaultMigrationsDir = join(process.cwd(), 'drizzle')

async function listMigrationFiles(migrationsDir: string) {
  const entries = await readdir(migrationsDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

export async function applyPgliteMigrations(client: PGlite, migrationsDir = defaultMigrationsDir) {
  await client.exec(`
    create table if not exists "${migrationTable}" (
      "name" text primary key,
      "applied_at" timestamp with time zone default now() not null
    );
  `)

  const appliedResult = await client.query<{ name: string }>(
    `select "name" from "${migrationTable}"`,
  )
  const appliedNames = new Set(appliedResult.rows.map((row) => row.name))

  for (const fileName of await listMigrationFiles(migrationsDir)) {
    if (appliedNames.has(fileName)) {
      continue
    }

    const migration = await readFile(join(migrationsDir, fileName), 'utf8')

    await client.exec(migration)
    await client.query(`insert into "${migrationTable}" ("name") values ($1)`, [fileName])
  }
}
