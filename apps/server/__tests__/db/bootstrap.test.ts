import { randomUUID } from 'node:crypto'
import {
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
} from '@rev30/shared'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { authPasswordCredentials, roles, userRoles, users } from '../../src/db/schema'
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

    const [user] = await database.select().from(users).where(eq(users.username, 'admin'))
    const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))
    const bindings = await database
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, user?.id ?? ''), eq(userRoles.roleId, adminRole?.id ?? '')))
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

    const [createdUser] = await database.select().from(users).where(eq(users.username, 'admin'))

    if (!createdUser) {
      throw new Error('Expected bootstrap user')
    }

    await database
      .update(users)
      .set({
        nickname: 'Old Root',
        email: null,
        phone: '13300000000',
        status: USER_STATUS_DISABLED,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, createdUser.id))

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'second-admin-password',
      nickname: 'Root',
      email: 'root@example.com',
      phone: null,
    })

    const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))
    const [user] = await database.select().from(users).where(eq(users.username, 'admin'))
    const bindings = await database
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, user?.id ?? ''), eq(userRoles.roleId, adminRole?.id ?? '')))
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, user?.id ?? ''))

    expect(user).toMatchObject({
      nickname: 'Root',
      email: 'root@example.com',
      phone: null,
      status: USER_STATUS_ENABLED,
      deletedAt: null,
    })
    expect(bindings).toHaveLength(1)
    await expect(
      verifyPassword('second-admin-password', credential?.passwordHash ?? ''),
    ).resolves.toBe(true)
  })

  it('requires username and password', async () => {
    const database = await createTestDb()

    await expect(
      bootstrapAdminUser(database, {
        username: '   ',
        password: 'secret-admin-password',
        nickname: 'Administrator',
        email: null,
        phone: null,
      }),
    ).rejects.toThrow('必须提供初始管理员用户名和密码')

    await expect(
      bootstrapAdminUser(database, {
        username: 'admin',
        password: '',
        nickname: 'Administrator',
        email: null,
        phone: null,
      }),
    ).rejects.toThrow('必须提供初始管理员用户名和密码')
  })

  it('fails when the admin role does not exist', async () => {
    const database = await createTestDb()

    await database.delete(roles).where(eq(roles.code, 'admin'))

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
      .update(roles)
      .set({
        status: ROLE_STATUS_DISABLED,
        updatedAt: now,
      })
      .where(eq(roles.code, 'admin'))

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
      .update(roles)
      .set({
        status: ROLE_STATUS_ENABLED,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(roles.code, 'admin'))

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

  it('adds a password credential for an existing user without one', async () => {
    const database = await createTestDb()
    const userId = randomUUID()
    const deletedAt = new Date('2026-05-01T00:00:00.000Z')

    await database.insert(users).values({
      id: userId,
      username: 'admin',
      nickname: 'Legacy Admin',
      email: 'legacy@example.com',
      phone: '18800000000',
      status: USER_STATUS_DISABLED,
      createdAt: now,
      updatedAt: now,
      deletedAt,
    })

    await bootstrapAdminUser(database, {
      username: 'admin',
      password: 'restored-admin-password',
      nickname: 'Administrator',
      email: null,
      phone: null,
    })

    const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))
    const [user] = await database.select().from(users).where(eq(users.id, userId))
    const bindings = await database
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, adminRole?.id ?? '')))
    const [credential] = await database
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, userId))

    expect(user).toMatchObject({
      nickname: 'Administrator',
      email: null,
      phone: null,
      status: USER_STATUS_ENABLED,
      deletedAt: null,
    })
    expect(bindings).toHaveLength(1)
    await expect(
      verifyPassword('restored-admin-password', credential?.passwordHash ?? ''),
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

    const allUsers = await database.select().from(users).where(eq(users.username, 'admin'))
    const [adminRole] = await database.select().from(roles).where(eq(roles.code, 'admin'))
    const allCredentials = await database.select().from(authPasswordCredentials)
    const bindings = await database
      .select()
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, allUsers[0]?.id ?? ''), eq(userRoles.roleId, adminRole?.id ?? '')),
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
