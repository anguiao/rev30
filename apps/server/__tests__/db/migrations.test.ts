import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  authPasswordCredentials,
  authRefreshTokens,
  departments,
  roleResources,
  roles,
  systemResources,
  userRoles,
  userDepartments,
  users,
} from '../../src/db/schema'
import { createDb } from '../../src/db/index'
import { applyPgliteMigrations, defaultMigrationsDir } from '../../src/db/migrations'
import { createTestDb } from '../helpers/db'
import {
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_MENU,
  USER_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
} from '@rev30/shared'

const originalNodeEnv = process.env.NODE_ENV
const originalPgliteDataDir = process.env.PGLITE_DATA_DIR
const tempDirs: string[] = []

const seededSystemMenus = [
  {
    code: 'system',
    id: '10000000-0000-4000-8000-000000000000',
    type: RESOURCE_TYPE_DIRECTORY,
    path: null,
    icon: 'lucide:settings',
    parentCode: null,
  },
  {
    code: 'system:user',
    id: '10000000-0000-4000-8000-000000000010',
    type: RESOURCE_TYPE_MENU,
    path: '/system/users',
    icon: 'lucide:users',
    parentCode: 'system',
  },
  {
    code: 'system:department',
    id: '10000000-0000-4000-8000-000000000020',
    type: RESOURCE_TYPE_MENU,
    path: '/system/departments',
    icon: 'lucide:building-2',
    parentCode: 'system',
  },
  {
    code: 'system:role',
    id: '10000000-0000-4000-8000-000000000030',
    type: RESOURCE_TYPE_MENU,
    path: '/system/roles',
    icon: 'lucide:shield-check',
    parentCode: 'system',
  },
  {
    code: 'system:resource',
    id: '10000000-0000-4000-8000-000000000040',
    type: RESOURCE_TYPE_MENU,
    path: '/system/resources',
    icon: 'lucide:blocks',
    parentCode: 'system',
  },
] as const

const seededSystemActions = [
  {
    id: '10000000-0000-4000-8000-000000000011',
    code: 'system:user:list',
    parentCode: 'system:user',
  },
  {
    id: '10000000-0000-4000-8000-000000000012',
    code: 'system:user:create',
    parentCode: 'system:user',
  },
  {
    id: '10000000-0000-4000-8000-000000000013',
    code: 'system:user:update',
    parentCode: 'system:user',
  },
  {
    id: '10000000-0000-4000-8000-000000000014',
    code: 'system:user:delete',
    parentCode: 'system:user',
  },
  {
    id: '10000000-0000-4000-8000-000000000021',
    code: 'system:department:list',
    parentCode: 'system:department',
  },
  {
    id: '10000000-0000-4000-8000-000000000022',
    code: 'system:department:create',
    parentCode: 'system:department',
  },
  {
    id: '10000000-0000-4000-8000-000000000023',
    code: 'system:department:update',
    parentCode: 'system:department',
  },
  {
    id: '10000000-0000-4000-8000-000000000024',
    code: 'system:department:delete',
    parentCode: 'system:department',
  },
  {
    id: '10000000-0000-4000-8000-000000000031',
    code: 'system:role:list',
    parentCode: 'system:role',
  },
  {
    id: '10000000-0000-4000-8000-000000000032',
    code: 'system:role:create',
    parentCode: 'system:role',
  },
  {
    id: '10000000-0000-4000-8000-000000000033',
    code: 'system:role:update',
    parentCode: 'system:role',
  },
  {
    id: '10000000-0000-4000-8000-000000000034',
    code: 'system:role:delete',
    parentCode: 'system:role',
  },
  {
    id: '10000000-0000-4000-8000-000000000041',
    code: 'system:resource:list',
    parentCode: 'system:resource',
  },
  {
    id: '10000000-0000-4000-8000-000000000042',
    code: 'system:resource:create',
    parentCode: 'system:resource',
  },
  {
    id: '10000000-0000-4000-8000-000000000043',
    code: 'system:resource:update',
    parentCode: 'system:resource',
  },
  {
    id: '10000000-0000-4000-8000-000000000044',
    code: 'system:resource:delete',
    parentCode: 'system:resource',
  },
] as const

const seededSystemResourceCodes = [
  ...seededSystemMenus.map((item) => item.code),
  ...seededSystemActions.map((item) => item.code),
]

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

    expect(created.builtIn).toBe(false)

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

  it('creates usable role tables for fresh development databases', async () => {
    const dataDir = join(await createTempDir(), 'roles')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const database = await createDb()
    const now = new Date()
    const [createdUser] = await database
      .insert(users)
      .values({
        id: randomUUID(),
        username: 'role-user',
        nickname: 'Role User',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    const [createdResource] = await database
      .insert(systemResources)
      .values({
        id: randomUUID(),
        type: 'action',
        name: 'Create User',
        code: 'test-system:user:create',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    const [createdRole] = await database
      .insert(roles)
      .values({
        id: randomUUID(),
        name: 'Administrator',
        code: 'test-admin',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!createdUser || !createdResource || !createdRole) {
      throw new Error('Expected migrated user, resource, and role')
    }

    const [createdRoleResource] = await database
      .insert(roleResources)
      .values({
        roleId: createdRole.id,
        resourceId: createdResource.id,
        createdAt: now,
      })
      .returning()
    const [createdUserRole] = await database
      .insert(userRoles)
      .values({
        userId: createdUser.id,
        roleId: createdRole.id,
        createdAt: now,
      })
      .returning()

    expect(createdRoleResource).toMatchObject({
      roleId: createdRole.id,
      resourceId: createdResource.id,
    })
    expect(createdUserRole).toMatchObject({
      userId: createdUser.id,
      roleId: createdRole.id,
    })
  })

  it('adds password credential state and reset-password resource', async () => {
    const database = await createTestDb()

    await database.insert(users).values({
      id: '11111111-1111-4111-8111-111111111111',
      username: 'migration-password-state',
      nickname: 'Migration Password State',
      status: USER_STATUS_ENABLED,
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
      updatedAt: new Date('2026-05-08T00:00:00.000Z'),
    })

    const credentialRows = await database
      .insert(authPasswordCredentials)
      .values({
        userId: '11111111-1111-4111-8111-111111111111',
        passwordHash: 'hash',
        createdAt: new Date('2026-05-08T00:00:00.000Z'),
        updatedAt: new Date('2026-05-08T00:00:00.000Z'),
      })
      .returning()

    expect(credentialRows[0]?.mustChangePassword).toBe(false)

    const resetResource = await database
      .select()
      .from(systemResources)
      .where(eq(systemResources.code, 'system:user:reset-password'))
      .limit(1)

    expect(resetResource[0]).toMatchObject({
      type: 'action',
      name: '重置密码',
      code: 'system:user:reset-password',
    })
  })

  it('seeds built-in system resources and the admin role without role resource bindings', async () => {
    const database = await createTestDb()

    const resourceRows = await database
      .select({
        id: systemResources.id,
        code: systemResources.code,
        type: systemResources.type,
        path: systemResources.path,
        icon: systemResources.icon,
        parentId: systemResources.parentId,
      })
      .from(systemResources)
      .where(
        and(
          isNull(systemResources.deletedAt),
          inArray(systemResources.code, seededSystemResourceCodes),
        ),
      )

    const resourceByCode = new Map(resourceRows.map((row) => [row.code, row]))
    expect(resourceRows).toHaveLength(seededSystemResourceCodes.length)

    for (const menu of seededSystemMenus) {
      const row = resourceByCode.get(menu.code)

      expect(row).toMatchObject({
        id: menu.id,
        code: menu.code,
        type: menu.type,
        path: menu.path,
        icon: menu.icon,
      })

      if (menu.parentCode === null) {
        expect(row?.parentId).toBeNull()
      } else {
        expect(row?.parentId).toBe(resourceByCode.get(menu.parentCode)?.id)
      }
    }

    for (const action of seededSystemActions) {
      const row = resourceByCode.get(action.code)

      expect(row).toMatchObject({
        id: action.id,
        code: action.code,
        type: RESOURCE_TYPE_ACTION,
        path: null,
        icon: null,
      })
      expect(row?.parentId).toBe(resourceByCode.get(action.parentCode)?.id)
    }

    const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))
    expect(adminRole).toMatchObject({
      id: '20000000-0000-4000-8000-000000000000',
      name: 'Administrator',
      code: 'admin',
      status: ROLE_STATUS_ENABLED,
    })

    const adminBindings = await database
      .select()
      .from(roleResources)
      .where(eq(roleResources.roleId, adminRole?.id ?? ''))

    expect(adminBindings).toEqual([])
  })

  it('maps built-in resource parents to existing rows when system code already exists', async () => {
    const client = new PGlite()
    const migrationsDir = await createTempDir()
    const existingSystemId = '30000000-0000-4000-8000-000000000000'

    try {
      const migrationFiles = (await readdir(defaultMigrationsDir))
        .filter((fileName) => fileName.endsWith('.sql'))
        .filter((fileName) => fileName !== '0005_seed_resource_access.sql')
        .sort()

      for (const fileName of migrationFiles) {
        const migrationSql = await readFile(join(defaultMigrationsDir, fileName), 'utf8')

        await writeFile(join(migrationsDir, fileName), migrationSql)
      }

      await applyPgliteMigrations(client, migrationsDir)
      await client.query(
        'insert into "system_resources" ("id", "type", "name", "code") values ($1, $2, $3, $4)',
        [existingSystemId, 'directory', 'Legacy System', 'system'],
      )
      await writeFile(
        join(migrationsDir, '0005_seed_resource_access.sql'),
        await readFile(join(defaultMigrationsDir, '0005_seed_resource_access.sql'), 'utf8'),
      )
      await applyPgliteMigrations(client, migrationsDir)

      const systemRootResult = await client.query<{
        id: string
        name: string
        icon: string | null
      }>(`select "id", "name", "icon" from "system_resources" where "code" = 'system'`)
      const systemUserMenuResult = await client.query<{ parentId: string | null }>(
        `select "parent_id" as "parentId" from "system_resources" where "code" = 'system:user'`,
      )
      const systemRoot = systemRootResult.rows[0]
      const systemUserMenu = systemUserMenuResult.rows[0]

      expect(systemRoot?.id).toBe(existingSystemId)
      expect(systemRoot?.name).toBe('系统管理')
      expect(systemRoot?.icon).toBe('lucide:settings')
      expect(systemUserMenu?.parentId).toBe(existingSystemId)
    } finally {
      await client.close()
    }
  })

  it('normalizes legacy resource icons when applying the resource access migration', async () => {
    const client = new PGlite()
    const migrationsDir = await createTempDir()

    try {
      const migrationFiles = (await readdir(defaultMigrationsDir))
        .filter((fileName) => fileName.endsWith('.sql'))
        .filter((fileName) => fileName !== '0005_seed_resource_access.sql')
        .sort()

      for (const fileName of migrationFiles) {
        const migrationSql = await readFile(join(defaultMigrationsDir, fileName), 'utf8')

        await writeFile(join(migrationsDir, fileName), migrationSql)
      }

      await applyPgliteMigrations(client, migrationsDir)
      await client.query(`
        insert into "system_resources"
          ("id", "type", "name", "code", "icon")
        values
          ('40000000-0000-4000-8000-000000000000', 'directory', 'Legacy Root', 'legacy:root', 'i-[lucide--settings]'),
          ('40000000-0000-4000-8000-000000000001', 'menu', 'Legacy Menu', 'legacy:menu', 'not-an-icon'),
          ('40000000-0000-4000-8000-000000000002', 'menu', 'Valid Menu', 'legacy:valid', 'lucide:users'),
          ('40000000-0000-4000-8000-000000000003', 'menu', 'Empty Menu', 'legacy:empty', null)
      `)
      await writeFile(
        join(migrationsDir, '0005_seed_resource_access.sql'),
        await readFile(join(defaultMigrationsDir, '0005_seed_resource_access.sql'), 'utf8'),
      )

      await applyPgliteMigrations(client, migrationsDir)

      const result = await client.query<{ code: string; icon: string | null }>(`
        select "code", "icon"
        from "system_resources"
        where "code" in ('legacy:root', 'legacy:menu', 'legacy:valid', 'legacy:empty')
        order by "code"
      `)

      expect(result.rows).toEqual([
        { code: 'legacy:empty', icon: null },
        { code: 'legacy:menu', icon: null },
        { code: 'legacy:root', icon: 'lucide:settings' },
        { code: 'legacy:valid', icon: 'lucide:users' },
      ])
    } finally {
      await client.close()
    }
  })

  it('creates usable system resource tables for fresh development databases', async () => {
    const dataDir = join(await createTempDir(), 'resources')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const database = await createDb()
    const now = new Date()
    const [root] = await database
      .insert(systemResources)
      .values({
        id: randomUUID(),
        type: 'directory',
        name: 'System',
        code: 'test-system',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!root) {
      throw new Error('Expected migrated system resource')
    }

    const [child] = await database
      .insert(systemResources)
      .values({
        id: randomUUID(),
        parentId: root.id,
        type: 'menu',
        name: 'Users',
        code: 'test-system:user',
        path: '/system/users',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    expect(child).toMatchObject({
      parentId: root.id,
      code: 'test-system:user',
      path: '/system/users',
    })
  })

  it('keeps Drizzle migration journal in sync with SQL migrations', async () => {
    const migrationFiles = (await readdir(defaultMigrationsDir))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort()
    const journalEntries = JSON.parse(
      readFileSync(join(defaultMigrationsDir, 'meta', '_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string; when: number }[]
    }
    const journalMigrations = readMigrationFiles({
      migrationsFolder: defaultMigrationsDir,
    })
    const journalSql = journalMigrations.flatMap((migration) => migration.sql).join('\n')

    expect(journalEntries.entries.map((entry) => entry.tag)).toEqual(
      migrationFiles.map((fileName) => fileName.replace('.sql', '')),
    )
    expect(journalEntries.entries.map((entry) => entry.when)).toHaveLength(migrationFiles.length)
    expect(journalSql).toContain('CREATE TABLE "auth_password_credentials"')
    expect(journalSql).toContain('CREATE TABLE "auth_refresh_tokens"')
    expect(journalSql).toContain('CREATE TABLE "departments"')
    expect(journalSql).toContain('CREATE TABLE "user_departments"')
    expect(journalSql).toContain('CREATE TABLE "system_resources"')
    expect(journalSql).toContain('CREATE TABLE "roles"')
    expect(journalSql).toContain('CREATE TABLE "role_resources"')
    expect(journalSql).toContain('CREATE TABLE "user_roles"')
  })
})
