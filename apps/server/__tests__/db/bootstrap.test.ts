import {
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_DISABLED,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'
import { eq, inArray } from 'drizzle-orm'
import { assert, describe, expect } from 'vitest'
import { bootstrapAdminUser } from '../../src/db/bootstrap'
import {
  authPasswordCredentials,
  systemRoles,
  systemUserRoles,
  systemUsers,
} from '../../src/db/schema'
import { hashPassword, verifyPassword } from '../../src/modules/auth/password'
import { dbTest } from '../fixtures/database'
import { createSystemUserFixture } from '../helpers/system'

const now = new Date('2026-05-06T00:00:00.000Z')
const adminInput = {
  username: 'admin',
  password: 'secret-admin-password',
  nickname: 'Administrator',
  email: 'admin@example.com',
  phone: null,
}

describe('bootstrap admin user', () => {
  dbTest('creates an enabled admin user with a password and the admin role', async ({ db }) => {
    await bootstrapAdminUser(db, adminInput)

    const [user] = await db.select().from(systemUsers)
    const [adminRole] = await db.select().from(systemRoles).where(eq(systemRoles.code, 'admin'))
    assert(user, 'Expected bootstrapped admin user')
    assert(adminRole, 'Expected seeded admin role')

    const bindings = await db.select().from(systemUserRoles)
    const credentials = await db.select().from(authPasswordCredentials)

    expect(user).toMatchObject({
      username: adminInput.username,
      nickname: adminInput.nickname,
      email: adminInput.email,
      phone: null,
      status: USER_STATUS_ENABLED,
      builtIn: true,
      deletedAt: null,
    })
    expect(bindings).toEqual([expect.objectContaining({ userId: user.id, roleId: adminRole.id })])
    expect(credentials).toEqual([
      expect.objectContaining({ userId: user.id, mustChangePassword: false }),
    ])
    const [credential] = credentials
    assert(credential, 'Expected admin password credential')
    await expect(verifyPassword(adminInput.password, credential.passwordHash)).resolves.toBe(true)
  })

  dbTest(
    'rejects repeated initialization with the same or a different username',
    async ({ db }) => {
      await bootstrapAdminUser(db, adminInput)
      const users = await db.select().from(systemUsers)
      const credentials = await db.select().from(authPasswordCredentials)
      const bindings = await db.select().from(systemUserRoles)

      for (const username of [adminInput.username, 'another-admin']) {
        await expect(
          bootstrapAdminUser(db, {
            ...adminInput,
            username,
            nickname: 'Replacement Admin',
            password: 'replacement-password',
            email: 'replacement@example.com',
            phone: '18800000000',
          }),
        ).rejects.toThrow('系统已完成管理员初始化，不能重复执行')

        expect(await db.select().from(systemUsers)).toEqual(users)
        expect(await db.select().from(authPasswordCredentials)).toEqual(credentials)
        expect(await db.select().from(systemUserRoles)).toEqual(bindings)
      }
    },
  )

  dbTest(
    'does not bypass initialization when a built-in user is disabled or deleted',
    async ({ db }) => {
      const user = await createSystemUserFixture(db, {
        username: 'previous-admin',
        status: USER_STATUS_DISABLED,
        builtIn: true,
      })

      await expect(bootstrapAdminUser(db, adminInput)).rejects.toThrow(
        '系统已完成管理员初始化，不能重复执行',
      )
      expect(await db.select().from(systemUsers)).toEqual([user])

      const [deletedUser] = await db
        .update(systemUsers)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(systemUsers.id, user.id))
        .returning()

      await expect(bootstrapAdminUser(db, adminInput)).rejects.toThrow(
        '系统已完成管理员初始化，不能重复执行',
      )
      expect(await db.select().from(systemUsers)).toEqual([deletedUser])
      expect(await db.select().from(authPasswordCredentials)).toEqual([])
      expect(await db.select().from(systemUserRoles)).toEqual([])
    },
  )

  dbTest('does not change credentials or elevate an existing ordinary user', async ({ db }) => {
    const user = await createSystemUserFixture(db, {
      username: adminInput.username,
      nickname: 'Existing User',
      status: USER_STATUS_DISABLED,
    })
    const [credential] = await db
      .insert(authPasswordCredentials)
      .values({
        userId: user.id,
        passwordHash: await hashPassword('existing-user-password'),
        mustChangePassword: true,
      })
      .returning()

    await expect(bootstrapAdminUser(db, adminInput)).rejects.toThrow('初始化管理员用户名已被占用')

    expect(await db.select().from(systemUsers)).toEqual([user])
    expect(await db.select().from(authPasswordCredentials)).toEqual([credential])
    expect(await db.select().from(systemUserRoles)).toEqual([])
  })

  dbTest('fails without creating a user when the admin role is missing', async ({ db }) => {
    await db.delete(systemRoles).where(eq(systemRoles.code, 'admin'))

    await expect(bootstrapAdminUser(db, adminInput)).rejects.toThrow(
      'admin 角色不存在或不可用，请先检查数据库迁移和角色状态',
    )

    expect(await db.select().from(systemUsers)).toEqual([])
    expect(await db.select().from(authPasswordCredentials)).toEqual([])
  })

  dbTest('fails when the admin role is disabled or soft deleted', async ({ db }) => {
    await db
      .update(systemRoles)
      .set({ status: ROLE_STATUS_DISABLED, updatedAt: now })
      .where(eq(systemRoles.code, 'admin'))

    await expect(bootstrapAdminUser(db, adminInput)).rejects.toThrow(
      'admin 角色不存在或不可用，请先检查数据库迁移和角色状态',
    )

    await db
      .update(systemRoles)
      .set({ status: ROLE_STATUS_ENABLED, deletedAt: now, updatedAt: now })
      .where(eq(systemRoles.code, 'admin'))

    await expect(bootstrapAdminUser(db, adminInput)).rejects.toThrow(
      'admin 角色不存在或不可用，请先检查数据库迁移和角色状态',
    )

    expect(await db.select().from(systemUsers)).toEqual([])
    expect(await db.select().from(authPasswordCredentials)).toEqual([])
  })

  dbTest(
    'creates only one administrator for simultaneous initialization calls',
    async ({ pglite }) => {
      // Top-level transactions are required; nested savepoints share the same row locks.
      // PGlite serializes these transactions and does not prove PostgreSQL cross-connection locking.
      const database = pglite.database
      const usernames = ['concurrent-admin-one', 'concurrent-admin-two']

      try {
        const results = await Promise.allSettled(
          usernames.map((username) => bootstrapAdminUser(database, { ...adminInput, username })),
        )

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        const failures = results.filter((result) => result.status === 'rejected')
        expect(failures).toHaveLength(1)
        expect(failures[0]?.reason).toEqual(new Error('系统已完成管理员初始化，不能重复执行'))

        const users = await database.select().from(systemUsers)
        const credentials = await database.select().from(authPasswordCredentials)
        const bindings = await database.select().from(systemUserRoles)
        const [adminRole] = await database
          .select()
          .from(systemRoles)
          .where(eq(systemRoles.code, 'admin'))

        expect(users).toHaveLength(1)
        const [user] = users
        assert(user, 'Expected bootstrapped admin user')
        assert(adminRole, 'Expected seeded admin role')
        expect(user.builtIn).toBe(true)
        expect(usernames).toContain(user.username)
        expect(credentials).toEqual([expect.objectContaining({ userId: user.id })])
        expect(bindings).toEqual([
          expect.objectContaining({ userId: user.id, roleId: adminRole.id }),
        ])
      } finally {
        const users = await database
          .select({ id: systemUsers.id })
          .from(systemUsers)
          .where(inArray(systemUsers.username, usernames))

        for (const user of users) {
          await database.delete(systemUserRoles).where(eq(systemUserRoles.userId, user.id))
          await database
            .delete(authPasswordCredentials)
            .where(eq(authPasswordCredentials.userId, user.id))
          await database.delete(systemUsers).where(eq(systemUsers.id, user.id))
        }
      }
    },
  )
})
