import { randomUUID } from 'node:crypto'
import {
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  authPasswordCredentials,
  systemRoles,
  systemUserRoles,
  systemUsers,
} from '../../src/db/schema'
import { bootstrapAdminUser } from '../../src/db/bootstrap'
import { verifyPassword } from '../../src/modules/auth/password'
import { createTestDb } from '../helpers/db'

const now = new Date('2026-05-06T00:00:00.000Z')

describe('bootstrap admin user', () => {
  it('creates an enabled admin user and binds the admin role', async () => {
    const database = await createTestDb()

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'secret-admin-password',
      nickname: 'Administrator',
      email: null,
      phone: null,
    })

    const [user] = await database
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.username, 'admin'))
    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, 'admin'))
    const bindings = await database
      .select()
      .from(systemUserRoles)
      .where(
        and(
          eq(systemUserRoles.userId, user?.id ?? ''),
          eq(systemUserRoles.roleId, adminRole?.id ?? ''),
        ),
      )
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, user?.id ?? ''))

    expect(user).toMatchObject({
      username: 'admin',
      nickname: 'Administrator',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      builtIn: true,
      deletedAt: null,
    })
    expect(bindings).toEqual([
      expect.objectContaining({
        userId: user?.id,
        roleId: adminRole?.id,
      }),
    ])
    await expect(
      verifyPassword('secret-admin-password', credential?.passwordHash ?? ''),
    ).resolves.toBe(true)
  })

  it('updates an existing admin user, updates password, and keeps a single admin binding', async () => {
    const database = await createTestDb()

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'first-admin-password',
      nickname: 'Administrator',
      email: null,
      phone: null,
    })

    const [createdUser] = await database
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.username, 'admin'))

    if (!createdUser) {
      throw new Error('Expected bootstrap user')
    }

    await database
      .update(systemUsers)
      .set({
        nickname: 'Old Root',
        email: null,
        phone: '13300000000',
        status: USER_STATUS_DISABLED,
        updatedAt: now,
      })
      .where(eq(systemUsers.id, createdUser.id))

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'second-admin-password',
      nickname: 'Root',
      email: 'root@example.com',
      phone: null,
    })

    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, 'admin'))
    const [user] = await database
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.username, 'admin'))
    const bindings = await database
      .select()
      .from(systemUserRoles)
      .where(
        and(
          eq(systemUserRoles.userId, user?.id ?? ''),
          eq(systemUserRoles.roleId, adminRole?.id ?? ''),
        ),
      )
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, user?.id ?? ''))

    expect(user).toMatchObject({
      id: createdUser.id,
      nickname: 'Root',
      email: 'root@example.com',
      phone: null,
      status: USER_STATUS_ENABLED,
      builtIn: true,
      deletedAt: null,
    })
    expect(bindings).toHaveLength(1)
    await expect(
      verifyPassword('second-admin-password', credential?.passwordHash ?? ''),
    ).resolves.toBe(true)
  })

  it('fails when the admin role does not exist', async () => {
    const database = await createTestDb()

    await database.delete(systemRoles).where(eq(systemRoles.code, 'admin'))

    await expect(
      bootstrapAdminUser(database, {
        username: 'admin',
        password: 'secret-admin-password',
        nickname: 'Administrator',
        email: null,
        phone: null,
      }),
    ).rejects.toThrow('admin 角色不存在，请先执行数据库迁移')
  })

  it('fails when the admin role is disabled or soft deleted', async () => {
    const database = await createTestDb()

    await database
      .update(systemRoles)
      .set({
        status: ROLE_STATUS_DISABLED,
        updatedAt: now,
      })
      .where(eq(systemRoles.code, 'admin'))

    await expect(
      bootstrapAdminUser(database, {
        username: 'admin',
        password: 'secret-admin-password',
        nickname: 'Administrator',
        email: null,
        phone: null,
      }),
    ).rejects.toThrow('admin 角色不存在，请先执行数据库迁移')

    await database
      .update(systemRoles)
      .set({
        status: ROLE_STATUS_ENABLED,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(systemRoles.code, 'admin'))

    await expect(
      bootstrapAdminUser(database, {
        username: 'admin',
        password: 'secret-admin-password',
        nickname: 'Administrator',
        email: null,
        phone: null,
      }),
    ).rejects.toThrow('admin 角色不存在，请先执行数据库迁移')
  })

  it('adds a password credential for an existing active user without one', async () => {
    const database = await createTestDb()
    const userId = randomUUID()

    await database.insert(systemUsers).values({
      id: userId,
      username: 'admin',
      nickname: 'Legacy Admin',
      email: 'legacy@example.com',
      phone: '18800000000',
      status: USER_STATUS_DISABLED,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'restored-admin-password',
      nickname: 'Administrator',
      email: null,
      phone: null,
    })

    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, 'admin'))
    const [user] = await database.select().from(systemUsers).where(eq(systemUsers.id, userId))
    const bindings = await database
      .select()
      .from(systemUserRoles)
      .where(
        and(eq(systemUserRoles.userId, userId), eq(systemUserRoles.roleId, adminRole?.id ?? '')),
      )
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, userId))

    expect(user).toMatchObject({
      id: userId,
      nickname: 'Administrator',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      builtIn: true,
      deletedAt: null,
    })
    expect(bindings).toHaveLength(1)
    await expect(
      verifyPassword('restored-admin-password', credential?.passwordHash ?? ''),
    ).resolves.toBe(true)
  })

  it('creates a new active admin user when the existing admin was soft deleted', async () => {
    const database = await createTestDb()
    const deletedUserId = randomUUID()
    const deletedAt = new Date('2026-05-01T00:00:00.000Z')

    await database.insert(systemUsers).values({
      id: deletedUserId,
      username: 'admin',
      nickname: 'Deleted Admin',
      email: 'deleted-admin@example.com',
      phone: '18800000000',
      status: USER_STATUS_DISABLED,
      createdAt: now,
      updatedAt: now,
      deletedAt,
    })

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'new-admin-password',
      nickname: 'Administrator',
      email: 'admin@example.com',
      phone: null,
    })

    const users = await database.select().from(systemUsers).where(eq(systemUsers.username, 'admin'))
    const deletedUser = users.find((user) => user.id === deletedUserId)
    const activeUser = users.find((user) => user.id !== deletedUserId)

    if (!activeUser) {
      throw new Error('Expected active admin user')
    }

    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, 'admin'))
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, activeUser.id))
    const bindings = await database
      .select()
      .from(systemUserRoles)
      .where(
        and(
          eq(systemUserRoles.userId, activeUser.id),
          eq(systemUserRoles.roleId, adminRole?.id ?? ''),
        ),
      )

    expect(users).toHaveLength(2)
    expect(deletedUser).toMatchObject({
      id: deletedUserId,
      nickname: 'Deleted Admin',
      deletedAt,
    })
    expect(activeUser).toMatchObject({
      username: 'admin',
      nickname: 'Administrator',
      email: 'admin@example.com',
      phone: null,
      status: USER_STATUS_ENABLED,
      builtIn: true,
      deletedAt: null,
    })
    expect(bindings).toHaveLength(1)
    await expect(
      verifyPassword('new-admin-password', credential?.passwordHash ?? ''),
    ).resolves.toBe(true)
  })

  it('allows simultaneous bootstrap calls without duplicate user, credential, or admin binding rows', async () => {
    const database = await createTestDb()

    await expect(
      Promise.all([
        bootstrapAdminUser(database, {
          username: 'admin',
          password: 'secret-admin-password',
          nickname: 'Administrator',
          email: 'admin@example.com',
          phone: null,
        }),
        bootstrapAdminUser(database, {
          username: 'admin',
          password: 'secret-admin-password',
          nickname: 'Administrator',
          email: 'admin@example.com',
          phone: null,
        }),
      ]),
    ).resolves.toEqual([undefined, undefined])

    const allUsers = await database
      .select()
      .from(systemUsers)
      .where(eq(systemUsers.username, 'admin'))
    const [adminRole] = await database
      .select()
      .from(systemRoles)
      .where(eq(systemRoles.code, 'admin'))
    const allCredentials = await database.select().from(authPasswordCredentials)
    const bindings = await database
      .select()
      .from(systemUserRoles)
      .where(
        and(
          eq(systemUserRoles.userId, allUsers[0]?.id ?? ''),
          eq(systemUserRoles.roleId, adminRole?.id ?? ''),
        ),
      )

    expect(allUsers).toHaveLength(1)
    expect(allCredentials).toHaveLength(1)
    expect(bindings).toHaveLength(1)
    expect(allUsers[0]).toMatchObject({
      username: 'admin',
      nickname: 'Administrator',
      email: 'admin@example.com',
      status: USER_STATUS_ENABLED,
      deletedAt: null,
    })
  })
})
