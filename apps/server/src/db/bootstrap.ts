import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { USER_STATUS_ENABLED } from '@rev30/shared'
import { and, eq } from 'drizzle-orm'
import { createDb, type Db } from '.'
import { hashPassword } from '../modules/auth/password'
import {
  authPasswordCredentials,
  roles,
  userRoles,
  users,
} from './schema'

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
    .where(eq(roles.code, 'admin'))
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
    const [existingUser] = await tx.select().from(users).where(eq(users.username, username)).limit(1)
    const userId = existingUser?.id ?? randomUUID()

    if (existingUser) {
      await tx
        .update(users)
        .set({
          nickname,
          email,
          phone,
          status: USER_STATUS_ENABLED,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(users.id, userId))
    } else {
      await tx.insert(users).values({
        id: userId,
        username,
        nickname,
        email,
        phone,
        status: USER_STATUS_ENABLED,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
    }

    const [existingCredential] = await tx
      .select()
      .from(authPasswordCredentials)
      .where(eq(authPasswordCredentials.userId, userId))
      .limit(1)

    if (existingCredential) {
      await tx
        .update(authPasswordCredentials)
        .set({
          passwordHash,
          updatedAt: now,
        })
        .where(eq(authPasswordCredentials.userId, userId))
    } else {
      await tx.insert(authPasswordCredentials).values({
        userId,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      })
    }

    const [existingAdminBinding] = await tx
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, adminRole.id)))
      .limit(1)

    if (!existingAdminBinding) {
      await tx.insert(userRoles).values({
        userId,
        roleId: adminRole.id,
        createdAt: now,
      })
    }
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const database = await createDb()

  await bootstrapAdminUser(database, readBootstrapInput())

  console.log('初始管理员已就绪')
}
