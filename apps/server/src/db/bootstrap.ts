import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { ROLE_STATUS_ENABLED, USER_STATUS_ENABLED } from '@rev30/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { createManagedDb, type Db } from '.'
import { hashPassword } from '../modules/auth/password'
import { authPasswordCredentials, roles, userRoles, users } from './schema'

export type BootstrapAdminInput = {
  username: string
  password: string
  nickname: string
  email: string | null
  phone: string | null
}

function normalizeOptionalText(value: string | null) {
  if (value === null) {
    return null
  }

  const normalized = value.trim()

  return normalized.length === 0 ? null : normalized
}

export async function bootstrapAdminUser(database: Db, input: BootstrapAdminInput) {
  const username = input.username.trim()
  const password = input.password

  if (username.length === 0 || password.length === 0) {
    throw new Error('必须提供初始管理员用户名和密码')
  }

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
  const passwordHash = await hashPassword(password)
  const nickname = input.nickname.trim() || 'Administrator'
  const email = normalizeOptionalText(input.email)
  const phone = normalizeOptionalText(input.phone)

  await database.transaction(async (tx) => {
    const [upsertedUser] = await tx
      .insert(users)
      .values({
        id: randomUUID(),
        username,
        nickname,
        email,
        phone,
        status: USER_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          nickname,
          email,
          phone,
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

function readBootstrapInput(): BootstrapAdminInput {
  return {
    username: process.env.BOOTSTRAP_ADMIN_USERNAME ?? '',
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
    nickname: process.env.BOOTSTRAP_ADMIN_NICKNAME ?? 'Administrator',
    email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? null,
    phone: process.env.BOOTSTRAP_ADMIN_PHONE ?? null,
  }
}

type BootstrapCliDependencies = {
  bootstrapAdmin?: typeof bootstrapAdminUser
  createManagedDatabase?: typeof createManagedDb
  readInput?: () => BootstrapAdminInput
}

export async function runBootstrapCli({
  bootstrapAdmin = bootstrapAdminUser,
  createManagedDatabase = createManagedDb,
  readInput = readBootstrapInput,
}: BootstrapCliDependencies = {}) {
  const { close, db } = await createManagedDatabase()

  try {
    await bootstrapAdmin(db, readInput())
  } finally {
    await close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runBootstrapCli()

  console.log('初始管理员已就绪')
}
