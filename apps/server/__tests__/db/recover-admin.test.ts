import { randomUUID } from 'node:crypto'
import { hostname, userInfo } from 'node:os'
import { ROLE_STATUS_DISABLED, USER_STATUS_DISABLED } from '@rev30/contracts'
import { eq, sql } from 'drizzle-orm'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { recoverAdminFromCli, recoverAdminPassword } from '../../src/db/recover-admin'
import {
  authPasswordCredentials,
  authSessions,
  systemRoles,
  systemUserRoles,
  systemUsers,
} from '../../src/db/schema'
import { readAuthConfig } from '../../src/modules/auth/config'
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from '../../src/modules/auth/errors'
import { hashPassword, verifyPassword } from '../../src/modules/auth/password'
import { createAuthService } from '../../src/modules/auth/service'
import { dbTest, type TestDatabase } from '../fixtures/database'
import { createSystemRoleFixture, createSystemUserFixture } from '../helpers/system'

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(),
  closeDb: vi.fn(),
  transaction: vi.fn(),
  createInterface: vi.fn(),
  question: vi.fn(),
  closeTerminal: vi.fn(),
}))

vi.mock('../../src/db', () => ({ createDb: mocks.createDb }))
vi.mock('node:readline/promises', () => ({ createInterface: mocks.createInterface }))

const originalPassword = 'original-admin-password'
const originalPasswordHash = hashPassword(originalPassword)
const metadata = {
  requestId: randomUUID(),
  clientIp: null,
  clientIpSource: 'unavailable' as const,
  userAgent: null,
}

async function createAdmin(database: TestDatabase) {
  const user = await createSystemUserFixture(database, {
    username: 'recovery-admin',
    nickname: 'Existing Administrator',
    email: 'existing-admin@example.com',
    phone: '18800000000',
    builtIn: true,
  })
  const [role] = await database.select().from(systemRoles).where(eq(systemRoles.code, 'admin'))
  assert(role, 'Expected seeded admin role')
  await database.insert(systemUserRoles).values({ userId: user.id, roleId: role.id })
  await database.insert(authPasswordCredentials).values({
    userId: user.id,
    passwordHash: await originalPasswordHash,
  })

  return { user, role }
}

async function readRecoveryState(database: TestDatabase) {
  return {
    users: await database.select().from(systemUsers).orderBy(systemUsers.id),
    roles: await database.select().from(systemRoles).orderBy(systemRoles.id),
    bindings: await database
      .select()
      .from(systemUserRoles)
      .orderBy(systemUserRoles.userId, systemUserRoles.roleId),
    credentials: await database
      .select()
      .from(authPasswordCredentials)
      .orderBy(authPasswordCredentials.userId),
    sessions: await database.select().from(authSessions).orderBy(authSessions.id),
  }
}

describe('recover admin password', () => {
  dbTest(
    'replaces the password, revokes old sessions, and allows a normal password change',
    async ({ db }) => {
      const { user } = await createAdmin(db)
      const auth = createAuthService(db, readAuthConfig({}))
      const loginInput = { username: user.username, password: originalPassword }
      const sessions = [
        await auth.login(loginInput, metadata),
        await auth.login(loginInput, metadata),
      ]
      const loggedOutSession = await auth.login(loginInput, metadata)
      await auth.logout(loggedOutSession.accessToken, loggedOutSession.refreshToken)
      const additionalRole = await createSystemRoleFixture(db, {
        name: 'Additional Admin Role',
        code: 'additional-admin-role',
      })
      await db.insert(systemUserRoles).values({ userId: user.id, roleId: additionalRole.id })
      const otherUser = await createSystemUserFixture(db, { username: 'other-user' })
      await db.insert(authPasswordCredentials).values({
        userId: otherUser.id,
        passwordHash: await originalPasswordHash,
      })
      const otherSession = await auth.login(
        { username: otherUser.username, password: originalPassword },
        metadata,
      )
      const before = await readRecoveryState(db)

      const result = await recoverAdminPassword(db, user.username)

      expect(result.userId).toBe(user.id)
      expect(result.temporaryPassword).not.toBe(originalPassword)
      const after = await readRecoveryState(db)
      expect(after.users).toEqual(before.users)
      expect(after.roles).toEqual(before.roles)
      expect(after.bindings).toEqual(before.bindings)
      expect(after.credentials.filter((credential) => credential.userId !== user.id)).toEqual(
        before.credentials.filter((credential) => credential.userId !== user.id),
      )
      const credential = after.credentials.find((entry) => entry.userId === user.id)
      assert(credential, 'Expected recovered admin credential')
      expect(credential.mustChangePassword).toBe(true)
      expect(credential.passwordHash).not.toBe(result.temporaryPassword)
      await expect(verifyPassword(result.temporaryPassword, credential.passwordHash)).resolves.toBe(
        true,
      )
      await expect(verifyPassword(originalPassword, credential.passwordHash)).resolves.toBe(false)
      for (const session of before.sessions) {
        const recoveredSession = after.sessions.find((entry) => entry.id === session.id)
        if (session.userId === user.id && session.revokedAt === null) {
          expect(recoveredSession).toMatchObject({
            revokedAt: expect.any(Date),
            revocationReason: 'password_reset',
          })
        } else {
          expect(recoveredSession).toEqual(session)
        }
      }
      for (const session of sessions) {
        await expect(auth.me(session.accessToken)).rejects.toBeInstanceOf(AuthUnauthorizedError)
        await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
          AuthInvalidRefreshTokenError,
        )
      }
      await expect(auth.login(loginInput, metadata)).rejects.toBeInstanceOf(
        AuthInvalidCredentialsError,
      )
      await expect(auth.me(otherSession.accessToken)).resolves.toMatchObject({
        user: { id: otherUser.id },
      })
      await expect(auth.refresh(otherSession.refreshToken)).resolves.toMatchObject({
        user: { id: otherUser.id },
      })

      const recoveredLogin = await auth.login(
        { username: user.username, password: result.temporaryPassword },
        metadata,
      )
      const currentSession = await auth.me(recoveredLogin.accessToken)
      await auth.updatePassword(
        user.id,
        currentSession.currentSessionId,
        { currentPassword: result.temporaryPassword, newPassword: 'new-personal-password' },
        metadata,
      )
      const [updatedCredential] = await db
        .select()
        .from(authPasswordCredentials)
        .where(eq(authPasswordCredentials.userId, user.id))
      assert(updatedCredential, 'Expected updated admin credential')
      expect(updatedCredential.mustChangePassword).toBe(false)
      await expect(
        verifyPassword('new-personal-password', updatedCredential.passwordHash),
      ).resolves.toBe(true)
      await expect(
        verifyPassword(result.temporaryPassword, updatedCredential.passwordHash),
      ).resolves.toBe(false)
    },
  )

  dbTest('restores a missing password credential for an existing admin', async ({ db }) => {
    const { user } = await createAdmin(db)
    await db.delete(authPasswordCredentials).where(eq(authPasswordCredentials.userId, user.id))
    const before = await readRecoveryState(db)

    const result = await recoverAdminPassword(db, user.username)

    const after = await readRecoveryState(db)
    expect(after.users).toEqual(before.users)
    expect(after.bindings).toEqual(before.bindings)
    expect(after.credentials).toHaveLength(1)
    const [credential] = after.credentials
    assert(credential, 'Expected restored admin credential')
    expect(credential).toMatchObject({ userId: user.id, mustChangePassword: true })
    await expect(verifyPassword(result.temporaryPassword, credential.passwordHash)).resolves.toBe(
      true,
    )
  })

  dbTest.for([
    'missing user',
    'ordinary user',
    'non-built-in admin',
    'disabled user',
    'deleted user',
    'missing admin binding',
    'disabled admin role',
    'deleted admin role',
  ] as const)('rejects a %s without changing existing data', async (scenario, { db }) => {
    const { user, role } = await createAdmin(db)
    const auth = createAuthService(db, readAuthConfig({}))
    await auth.login({ username: user.username, password: originalPassword }, metadata)
    switch (scenario) {
      case 'ordinary user':
        await db.delete(systemUserRoles).where(eq(systemUserRoles.userId, user.id))
        await db.update(systemUsers).set({ builtIn: false }).where(eq(systemUsers.id, user.id))
        break
      case 'non-built-in admin':
        await db.update(systemUsers).set({ builtIn: false }).where(eq(systemUsers.id, user.id))
        break
      case 'disabled user':
        await db
          .update(systemUsers)
          .set({ status: USER_STATUS_DISABLED })
          .where(eq(systemUsers.id, user.id))
        break
      case 'deleted user':
        await db
          .update(systemUsers)
          .set({ deletedAt: new Date() })
          .where(eq(systemUsers.id, user.id))
        break
      case 'missing admin binding':
        await db.delete(systemUserRoles).where(eq(systemUserRoles.userId, user.id))
        break
      case 'disabled admin role':
        await db
          .update(systemRoles)
          .set({ status: ROLE_STATUS_DISABLED })
          .where(eq(systemRoles.id, role.id))
        break
      case 'deleted admin role':
        await db
          .update(systemRoles)
          .set({ deletedAt: new Date() })
          .where(eq(systemRoles.id, role.id))
        break
      case 'missing user':
        break
    }
    const before = await readRecoveryState(db)

    await expect(
      recoverAdminPassword(db, scenario === 'missing user' ? 'missing-admin' : user.username),
    ).rejects.toThrow()

    expect(await readRecoveryState(db)).toEqual(before)
  })

  dbTest('rolls back password changes if revoking sessions fails', async ({ db }) => {
    const { user } = await createAdmin(db)
    const auth = createAuthService(db, readAuthConfig({}))
    const session = await auth.login(
      { username: user.username, password: originalPassword },
      metadata,
    )
    await db.execute(sql`
      alter table auth_sessions
      add constraint recovery_test_reject_password_reset
      check (revocation_reason is distinct from 'password_reset')
    `)
    const before = await readRecoveryState(db)

    await expect(recoverAdminPassword(db, user.username)).rejects.toThrow()

    expect(await readRecoveryState(db)).toEqual(before)
    await expect(auth.me(session.accessToken)).resolves.toMatchObject({ user: { id: user.id } })
    await expect(
      auth.login({ username: user.username, password: originalPassword }, metadata),
    ).resolves.toMatchObject({ user: { id: user.id } })
  })
})

describe('recover admin CLI', () => {
  const originalInputTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  const originalOutputTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  const originalExitCode = process.exitCode
  let stdout: string[]
  let stderr: string[]

  function auditRecords() {
    return stderr
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown)
  }

  function auditContext(result: string) {
    return {
      action: 'admin_password_recovery',
      source: 'cli',
      operator: userInfo().username,
      host: hostname(),
      targetUsername: 'admin',
      result,
    }
  }

  beforeEach(() => {
    mocks.createDb
      .mockReset()
      .mockResolvedValue({ db: { transaction: mocks.transaction }, close: mocks.closeDb })
    mocks.closeDb.mockReset().mockResolvedValue(undefined)
    mocks.transaction.mockReset()
    mocks.createInterface.mockReset().mockReturnValue({
      question: mocks.question,
      close: mocks.closeTerminal,
    })
    mocks.question.mockReset().mockResolvedValue('admin')
    mocks.closeTerminal.mockReset()
    stdout = []
    stderr = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk))
      return true
    })
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true })
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalInputTty) {
      Object.defineProperty(process.stdin, 'isTTY', originalInputTty)
    } else {
      Reflect.deleteProperty(process.stdin, 'isTTY')
    }
    if (originalOutputTty) {
      Object.defineProperty(process.stdout, 'isTTY', originalOutputTty)
    } else {
      Reflect.deleteProperty(process.stdout, 'isTTY')
    }
    process.exitCode = originalExitCode
  })

  it.each(['stdin', 'stdout'] as const)(
    'refuses non-interactive %s before opening the database',
    async (stream) => {
      Object.defineProperty(process[stream], 'isTTY', { configurable: true, value: false })

      await recoverAdminFromCli(['--username', 'admin'])

      expect(mocks.createInterface).not.toHaveBeenCalled()
      expect(mocks.createDb).not.toHaveBeenCalled()
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(stdout).toEqual([])
      expect(process.exitCode).toBe(1)
      expect(auditRecords()).toEqual([
        expect.objectContaining({
          ...auditContext('failed'),
          err: expect.objectContaining({
            message: '管理员恢复必须在交互式终端执行，临时密码不可重定向输出',
          }),
        }),
      ])
    },
  )

  it.each([
    { args: ['--username', 'synthetic-secret'.repeat(5)], secret: 'synthetic-secret' },
    {
      args: ['--username', 'admin', '--password', 'synthetic-secret'],
      secret: 'synthetic-secret',
    },
  ])(
    'rejects invalid arguments without recording their values: $args',
    async ({ args, secret }) => {
      await recoverAdminFromCli(args)

      expect(mocks.createInterface).not.toHaveBeenCalled()
      expect(mocks.createDb).not.toHaveBeenCalled()
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(stdout).toEqual([])
      expect(stderr.join('')).not.toContain(secret)
      expect(process.exitCode).toBe(1)
      expect(auditRecords()).toEqual([
        expect.objectContaining({
          action: 'admin_password_recovery',
          result: 'failed',
          err: expect.objectContaining({
            message: '用法：pnpm --filter @rev30/server db:recover-admin --username <用户名>',
          }),
        }),
      ])
    },
  )

  it('cancels a mismatched confirmation without opening or changing the database', async () => {
    mocks.question.mockResolvedValue('another-admin')

    await recoverAdminFromCli(['--username', 'admin'])

    expect(mocks.closeTerminal).toHaveBeenCalledOnce()
    expect(mocks.createDb).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(stdout.join('')).toBe('已取消，未修改任何账号。\n')
    expect(process.exitCode).toBeUndefined()
    expect(auditRecords()).toEqual([expect.objectContaining(auditContext('cancelled'))])
  })

  dbTest(
    'prints the temporary password once and audits recovery without exposing it to logs',
    async ({ db }) => {
      const user = await createSystemUserFixture(db, { username: 'admin', builtIn: true })
      const [adminRole] = await db.select().from(systemRoles).where(eq(systemRoles.code, 'admin'))
      assert(adminRole, 'Expected seeded admin role')
      await db.insert(systemUserRoles).values({ userId: user.id, roleId: adminRole.id })
      mocks.createDb.mockResolvedValue({ db, close: mocks.closeDb })

      await recoverAdminFromCli(['--username', 'admin'])

      expect(mocks.closeTerminal).toHaveBeenCalledOnce()
      expect(mocks.closeDb).toHaveBeenCalledOnce()
      expect(stdout).toHaveLength(1)
      const temporaryPassword = stdout
        .join('')
        .match(/^临时密码（仅显示一次）：([^\n]+)\n请立即登录并修改密码。\n$/)?.[1]
      assert(temporaryPassword, 'Expected one temporary password in terminal output')
      const [credential] = await db
        .select()
        .from(authPasswordCredentials)
        .where(eq(authPasswordCredentials.userId, user.id))
      assert(credential, 'Expected recovered password credential')
      expect(credential.mustChangePassword).toBe(true)
      await expect(verifyPassword(temporaryPassword, credential.passwordHash)).resolves.toBe(true)
      expect(stderr.join('')).not.toContain(temporaryPassword)
      expect(process.exitCode).toBeUndefined()
      expect(auditRecords()).toEqual([
        expect.objectContaining(auditContext('started')),
        expect.objectContaining({ ...auditContext('succeeded'), targetUserId: user.id }),
      ])
    },
  )

  it('records a redacted failure, closes the database, and returns a failing exit code', async () => {
    const passwordHash = 'synthetic-sensitive-password-hash'
    mocks.transaction.mockRejectedValue(
      new DrizzleQueryError(
        'UPDATE auth_password_credentials SET password_hash = $1',
        [passwordHash],
        new Error('database unavailable'),
      ),
    )

    await recoverAdminFromCli(['--username', 'admin'])

    expect(mocks.closeTerminal).toHaveBeenCalledOnce()
    expect(mocks.closeDb).toHaveBeenCalledOnce()
    expect(stdout).toEqual([])
    expect(stderr.join('')).not.toContain(passwordHash)
    expect(process.exitCode).toBe(1)
    expect(auditRecords()).toEqual([
      expect.objectContaining(auditContext('started')),
      expect.objectContaining({
        ...auditContext('failed'),
        err: { type: 'DatabaseError', message: 'Database operation failed' },
      }),
    ])
  })
})
