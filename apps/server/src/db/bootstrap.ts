import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import {
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
  authRegisterSchema,
  type AuthRegisterInput,
} from '@rev30/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { createManagedDb, type Db } from '.'
import { hashPassword } from '../modules/auth/password'
import { authPasswordCredentials, roles, userRoles, users } from './schema'

export async function bootstrapAdminUser(database: Db, input: AuthRegisterInput) {
  const [adminRole] = await database
    .select()
    .from(roles)
    .where(
      and(eq(roles.code, 'admin'), eq(roles.status, ROLE_STATUS_ENABLED), isNull(roles.deletedAt)),
    )
    .limit(1)

  if (!adminRole) {
    throw new Error('admin 角色不存在，请先执行数据库迁移')
  }

  const now = new Date()
  const passwordHash = await hashPassword(input.password)

  await database.transaction(async (tx) => {
    const [upsertedUser] = await tx
      .insert(users)
      .values({
        id: randomUUID(),
        username: input.username,
        nickname: input.nickname,
        email: input.email ?? null,
        phone: input.phone ?? null,
        status: USER_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          nickname: input.nickname,
          email: input.email ?? null,
          phone: input.phone ?? null,
          status: USER_STATUS_ENABLED,
          deletedAt: null,
          updatedAt: now,
        },
      })
      .returning()

    if (!upsertedUser) {
      throw new Error('创建初始管理员失败')
    }

    await tx
      .insert(authPasswordCredentials)
      .values({
        userId: upsertedUser.id,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: authPasswordCredentials.userId,
        set: {
          passwordHash,
          updatedAt: now,
        },
      })

    await tx
      .insert(userRoles)
      .values({
        userId: upsertedUser.id,
        roleId: adminRole.id,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [userRoles.userId, userRoles.roleId],
      })
  })
}

export async function bootstrapAdminFromEnv() {
  const { close, db } = await createManagedDb()

  try {
    await bootstrapAdminUser(
      db,
      authRegisterSchema.parse({
        username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? '',
        password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
        nickname: process.env.BOOTSTRAP_ADMIN_NICKNAME?.trim() || 'Administrator',
        email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? null,
        phone: process.env.BOOTSTRAP_ADMIN_PHONE ?? null,
      }),
    )
  } finally {
    await close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bootstrapAdminFromEnv()

  console.log('初始管理员已就绪')
}
