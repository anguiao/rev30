import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  authPasswordCredentials,
  authRefreshTokens,
  departments,
  userDepartments,
  users,
} from '../../src/db/schema'
import { createDb } from '../../src/db/index'
import { applyPgliteMigrations, defaultMigrationsDir } from '../../src/db/migrations'

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

describe('PGlite migrations', () => {
  afterEach(async () => {
    restoreEnv('NODE_ENV', originalNodeEnv)
    restoreEnv('PGLITE_DATA_DIR', originalPgliteDataDir)

    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('runs every SQL migration in order', async () => {
    const migrationsDir = await createTempDir()
    const client = new PGlite()

    await writeFile(
      join(migrationsDir, '0000_create_widgets.sql'),
      'create table widgets (name text not null);',
    )
    await writeFile(
      join(migrationsDir, '0001_insert_widgets.sql'),
      "insert into widgets (name) values ('first'), ('second');",
    )

    await applyPgliteMigrations(client, migrationsDir)

    const result = await client.query<{ name: string }>('select name from widgets order by name')

    expect(result.rows).toEqual([{ name: 'first' }, { name: 'second' }])

    await client.close()
  })

  it('creates usable auth tables for fresh development databases', async () => {
    const dataDir = join(await createTempDir(), 'dev')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const database = await createDb()
    const now = new Date()
    const [created] = await database
      .insert(users)
      .values({
        id: randomUUID(),
        username: 'migration-auth',
        nickname: 'Migration Auth',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!created) {
      throw new Error('Expected migrated user')
    }

    const [credential] = await database
      .insert(authPasswordCredentials)
      .values({
        userId: created.id,
        passwordHash: 'scrypt$salt$hash',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const [session] = await database
      .insert(authRefreshTokens)
      .values({
        id: randomUUID(),
        userId: created.id,
        tokenHash: 'token-hash',
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    expect(credential?.passwordHash).toBe('scrypt$salt$hash')
    expect(session?.tokenHash).toBe('token-hash')
  })

  it('creates usable department tables for fresh development databases', async () => {
    const dataDir = join(await createTempDir(), 'departments')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const database = await createDb()
    const now = new Date()
    const [createdUser] = await database
      .insert(users)
      .values({
        id: randomUUID(),
        username: 'department-user',
        nickname: 'Department User',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const [createdDepartment] = await database
      .insert(departments)
      .values({
        id: randomUUID(),
        name: 'Engineering',
        code: 'engineering',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!createdUser || !createdDepartment) {
      throw new Error('Expected migrated user and department')
    }

    const [createdRelation] = await database
      .insert(userDepartments)
      .values({
        userId: createdUser.id,
        departmentId: createdDepartment.id,
        createdAt: now,
      })
      .returning()

    expect(createdRelation).toMatchObject({
      userId: createdUser.id,
      departmentId: createdDepartment.id,
    })
  })

  it('keeps Drizzle migration journal in sync with SQL migrations', async () => {
    const migrationFiles = (await readdir(defaultMigrationsDir))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort()
    const journalMigrations = readMigrationFiles({
      migrationsFolder: defaultMigrationsDir,
    })
    const journalSql = journalMigrations.flatMap((migration) => migration.sql).join('\n')

    expect(journalMigrations).toHaveLength(migrationFiles.length)
    expect(journalSql).toContain('CREATE TABLE "auth_password_credentials"')
    expect(journalSql).toContain('CREATE TABLE "auth_refresh_tokens"')
    expect(journalSql).toContain('CREATE TABLE "departments"')
    expect(journalSql).toContain('CREATE TABLE "user_departments"')
  })
})
