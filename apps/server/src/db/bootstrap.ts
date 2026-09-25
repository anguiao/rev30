import 'dotenv/config'
import {
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
  passwordInputSchema,
  userCreateSchema,
} from '@rev30/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'
import { createDb, type Db } from '.'
import { hashPassword } from '../modules/auth/password'
import { authPasswordCredentials, systemRoles, systemUserRoles, systemUsers } from './schema'

const bootstrapAdminSchema = userCreateSchema
  .pick({
    username: true,
    nickname: true,
    email: true,
    phone: true,
  })
  .extend({
    password: passwordInputSchema,
  })
  .strict()

type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>

export async function bootstrapAdminUser(database: Db, input: BootstrapAdminInput) {
  await database.transaction(async (tx) => {
    // Serialize bootstrap attempts before checking the global initialization marker.
    const [adminRole] = await tx
      .select({ id: systemRoles.id })
      .from(systemRoles)
      .where(
        and(
          eq(systemRoles.code, 'admin'),
          eq(systemRoles.status, ROLE_STATUS_ENABLED),
          isNull(systemRoles.deletedAt),
        ),
      )
      .limit(1)
      .for('update')

    if (!adminRole) {
      throw new Error('admin 角色不存在或不可用，请先检查数据库迁移和角色状态')
    }

    const [initializedAdmin] = await tx
      .select({ id: systemUsers.id })
      .from(systemUsers)
      .where(eq(systemUsers.builtIn, true))
      .limit(1)

    if (initializedAdmin) {
      throw new Error('系统已完成管理员初始化，不能重复执行')
    }

    const [existingUser] = await tx
      .select({ id: systemUsers.id })
      .from(systemUsers)
      .where(and(eq(systemUsers.username, input.username), isNull(systemUsers.deletedAt)))
      .limit(1)

    if (existingUser) {
      throw new Error('初始化管理员用户名已被占用')
    }

    const passwordHash = await hashPassword(input.password)
    const [createdUser] = await tx
      .insert(systemUsers)
      .values({
        username: input.username,
        nickname: input.nickname,
        email: input.email ?? null,
        phone: input.phone ?? null,
        status: USER_STATUS_ENABLED,
        builtIn: true,
        deletedAt: null,
      })
      .returning()

    if (!createdUser) {
      throw new Error('创建初始管理员失败')
    }

    await tx.insert(authPasswordCredentials).values({
      userId: createdUser.id,
      passwordHash,
      mustChangePassword: false,
    })

    await tx.insert(systemUserRoles).values({
      userId: createdUser.id,
      roleId: adminRole.id,
    })
  })
}

export async function bootstrapAdminFromEnv() {
  const { close, db } = await createDb()

  try {
    await bootstrapAdminUser(
      db,
      bootstrapAdminSchema.parse({
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

  console.log('初始管理员已创建')
}
