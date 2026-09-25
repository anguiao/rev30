import 'dotenv/config'
import {
  BUILT_IN_ADMIN_ROLE_CODE,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
  usernameInputSchema,
} from '@rev30/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import { hostname, userInfo } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { createDb, type Db } from '.'
import { generateTemporaryPassword, hashPassword } from '../modules/auth/password'
import { createLogger } from '../runtime/logger'
import {
  authPasswordCredentials,
  authSessions,
  systemRoles,
  systemUserRoles,
  systemUsers,
} from './schema'

export async function recoverAdminPassword(database: Db, username: string) {
  return await database.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(systemUsers)
      .where(and(eq(systemUsers.username, username), isNull(systemUsers.deletedAt)))
      .limit(1)
      .for('update')

    if (!user || !user.builtIn || user.status !== USER_STATUS_ENABLED) {
      throw new Error('只能恢复已启用且持有 admin 角色的内置管理员')
    }

    const [adminRole] = await tx
      .select({ id: systemRoles.id })
      .from(systemUserRoles)
      .innerJoin(systemRoles, eq(systemRoles.id, systemUserRoles.roleId))
      .where(
        and(
          eq(systemUserRoles.userId, user.id),
          eq(systemRoles.code, BUILT_IN_ADMIN_ROLE_CODE),
          eq(systemRoles.status, ROLE_STATUS_ENABLED),
          isNull(systemRoles.deletedAt),
        ),
      )
      .limit(1)

    if (!adminRole) {
      throw new Error('只能恢复已启用且持有 admin 角色的内置管理员')
    }

    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)
    const now = new Date()

    await tx
      .insert(authPasswordCredentials)
      .values({ userId: user.id, passwordHash, mustChangePassword: true })
      .onConflictDoUpdate({
        target: authPasswordCredentials.userId,
        set: { passwordHash, mustChangePassword: true, updatedAt: now },
      })

    await tx
      .update(authSessions)
      .set({ revokedAt: now, revocationReason: 'password_reset', updatedAt: now })
      .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)))

    return { userId: user.id, temporaryPassword }
  })
}

export async function recoverAdminFromCli(args = process.argv.slice(2)) {
  const audit = createLogger({ destination: process.stderr, level: 'info' }).child({
    action: 'admin_password_recovery',
    source: 'cli',
    operator: userInfo().username,
    host: hostname(),
  })
  let username: string | undefined

  try {
    const parsedUsername = usernameInputSchema.safeParse(args[1])
    if (args.length !== 2 || args[0] !== '--username' || !parsedUsername.success) {
      throw new Error('用法：pnpm --filter @rev30/server db:recover-admin --username <用户名>')
    }
    username = parsedUsername.data

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('管理员恢复必须在交互式终端执行，临时密码不可重定向输出')
    }

    const terminal = createInterface({ input: process.stdin, output: process.stdout })
    let confirmation: string
    try {
      confirmation = await terminal.question(
        `即将重置内置管理员 ${username} 的密码并撤销全部旧会话。请输入该用户名确认：`,
      )
    } finally {
      terminal.close()
    }

    if (confirmation !== username) {
      audit.info(
        { targetUsername: username, result: 'cancelled' },
        'admin password recovery cancelled',
      )
      process.stdout.write('已取消，未修改任何账号。\n')
      return
    }

    audit.info({ targetUsername: username, result: 'started' }, 'admin password recovery started')
    const { db, close } = await createDb()
    try {
      const result = await recoverAdminPassword(db, username)
      audit.info(
        { targetUsername: username, targetUserId: result.userId, result: 'succeeded' },
        'admin password recovery succeeded',
      )
      process.stdout.write(
        `临时密码（仅显示一次）：${result.temporaryPassword}\n请立即登录并修改密码。\n`,
      )
    } finally {
      await close()
    }
  } catch (error) {
    audit.error(
      { err: error, targetUsername: username, result: 'failed' },
      'admin password recovery failed',
    )
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await recoverAdminFromCli()
}
