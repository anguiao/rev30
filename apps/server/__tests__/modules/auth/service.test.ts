import { beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/contracts'
import type { AuthConfig } from '../../../src/modules/auth/config'
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
  AuthLoginRateLimitedError,
  AuthUnauthorizedError,
} from '../../../src/modules/auth/errors'
import { createAuthService } from '../../../src/modules/auth/service'
import { createTokenPair } from '../../../src/modules/auth/tokens'

const repository = vi.hoisted(() => ({
  findLoginAttemptBucketByUsername: vi.fn(),
  recordRateLimitedLogin: vi.fn(),
  findActiveUserCredentialByUsername: vi.fn(),
  recordLoginFailure: vi.fn(),
  createLoginSession: vi.fn(),
  findActiveUserById: vi.fn(),
  rotateSession: vi.fn(),
  findValidSessionUser: vi.fn(),
  touchSession: vi.fn(),
  revokeValidSession: vi.fn(),
  findActiveUserCredentialById: vi.fn(),
  updatePasswordAndReplaceSession: vi.fn(),
}))
const access = vi.hoisted(() => ({ resolveUserAccess: vi.fn() }))
const password = vi.hoisted(() => ({ verifyPassword: vi.fn(), hashPassword: vi.fn() }))

vi.mock('../../../src/modules/auth/repository', () => ({
  createAuthRepository: () => repository,
}))
vi.mock('../../../src/modules/auth/access', () => ({
  createUserAccessService: () => access,
}))
vi.mock('../../../src/modules/auth/password', () => password)
vi.mock('../../../src/modules/system/configs/values', () => ({
  readNumberConfigValue: vi.fn(async (_db, key: string) => (key.endsWith('MaxAttempts') ? 5 : 900)),
}))

const config: AuthConfig = {
  accessSecret: 'test-access-secret',
  refreshSecret: 'test-refresh-secret',
  attachmentSecret: 'test-attachment-secret',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  attachmentExpiresInSeconds: 86400,
  secureCookies: false,
}
const metadata = {
  requestId: '6afde8ac-04ec-4dc3-abcf-7bba62f89886',
  clientIp: '192.0.2.1',
  clientIpSource: 'socket' as const,
  userAgent: 'test-agent',
}
const userId = '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7'
const sessionId = '5dfc90f3-9d4d-40f2-a8b9-f7d1863e5ad0'
const now = new Date()
function account(status = USER_STATUS_ENABLED) {
  return {
    user: {
      id: userId,
      username: 'ada',
      nickname: 'Ada',
      avatarId: null,
      email: null,
      phone: null,
      status,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    credential: {
      userId,
      passwordHash: 'old-hash',
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
    },
    departments: [],
    roles: [],
  }
}

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repository.findLoginAttemptBucketByUsername.mockResolvedValue(undefined)
    repository.recordLoginFailure.mockResolvedValue(undefined)
    repository.createLoginSession.mockResolvedValue('success')
    repository.rotateSession.mockResolvedValue({ id: sessionId })
    repository.revokeValidSession.mockResolvedValue({ id: sessionId })
    repository.touchSession.mockResolvedValue({ id: sessionId })
    repository.updatePasswordAndReplaceSession.mockResolvedValue(account().user)
    password.verifyPassword.mockResolvedValue(true)
    password.hashPassword.mockResolvedValue('new-hash')
    access.resolveUserAccess.mockResolvedValue({ accessCodes: [], menus: [], isAdmin: false })
  })
  it('logs a rate-limited attempt without looking up the user or changing the bucket', async () => {
    repository.findLoginAttemptBucketByUsername.mockResolvedValue({
      lockedUntil: new Date(Date.now() + 60_000),
    })
    repository.recordRateLimitedLogin.mockResolvedValue(undefined)
    const service = createAuthService({} as never, config)

    await expect(
      service.login({ username: 'ada', password: 'secret-password' }, metadata),
    ).rejects.toBeInstanceOf(AuthLoginRateLimitedError)
    expect(repository.findActiveUserCredentialByUsername).not.toHaveBeenCalled()
    expect(repository.recordRateLimitedLogin).toHaveBeenCalledWith(
      'ada',
      metadata,
      expect.any(Date),
    )
  })

  it.each([
    ['unknown account', undefined, 'invalid_credentials', null],
    ['disabled account', account(USER_STATUS_DISABLED), 'account_disabled', userId],
  ])(
    'classifies %s without exposing the internal reason',
    async (_name, row, reason, loggedUserId) => {
      repository.findActiveUserCredentialByUsername.mockResolvedValue(row)
      const service = createAuthService({} as never, config)
      await expect(
        service.login({ username: 'ada', password: 'wrong' }, metadata),
      ).rejects.toBeInstanceOf(AuthInvalidCredentialsError)
      expect(repository.recordLoginFailure).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: reason, userId: loggedUserId, metadata }),
      )
    },
  )

  it('does not return signed tokens when the success transaction rejects the credential snapshot', async () => {
    repository.findActiveUserCredentialByUsername.mockResolvedValue(account())
    repository.createLoginSession.mockResolvedValue('invalid_credentials')
    const service = createAuthService({} as never, config)
    await expect(
      service.login({ username: 'ada', password: 'secret' }, metadata),
    ).rejects.toBeInstanceOf(AuthInvalidCredentialsError)
    expect(repository.recordLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: 'invalid_credentials' }),
    )
  })

  it('rejects a refresh bearer bound to another session without rotating', async () => {
    const refresh = await createTokenPair(userId, sessionId, config)
    const other = await createTokenPair(userId, '69e33f4f-253f-421a-aef8-246cbfe278c0', config)
    const service = createAuthService({} as never, config)
    await expect(service.refresh(refresh.refreshToken, other.accessToken)).rejects.toBeInstanceOf(
      AuthInvalidRefreshTokenError,
    )
    expect(repository.rotateSession).not.toHaveBeenCalled()
  })

  it('allows first recovery without access and resolves permissions before rotating', async () => {
    const pair = await createTokenPair(userId, sessionId, config)
    repository.findActiveUserById.mockResolvedValue(account())
    const service = createAuthService({} as never, config)
    await expect(service.refresh(pair.refreshToken)).resolves.toMatchObject({
      accessToken: expect.any(String),
    })
    expect(access.resolveUserAccess.mock.invocationCallOrder[0]).toBeLessThan(
      repository.rotateSession.mock.invocationCallOrder[0]!,
    )
  })

  it('does not rotate when current permission resolution fails', async () => {
    const pair = await createTokenPair(userId, sessionId, config)
    repository.findActiveUserById.mockResolvedValue(account())
    access.resolveUserAccess.mockRejectedValue(new Error('permission failed'))
    const service = createAuthService({} as never, config)
    await expect(service.refresh(pair.refreshToken)).rejects.toThrow('permission failed')
    expect(repository.rotateSession).not.toHaveBeenCalled()
  })

  it('does not touch a session active within five minutes', async () => {
    const pair = await createTokenPair(userId, sessionId, config)
    repository.findValidSessionUser.mockResolvedValue({
      ...account(),
      session: { lastActiveAt: new Date() },
    })
    const service = createAuthService({} as never, config)
    await expect(service.me(pair.accessToken)).resolves.toMatchObject({
      currentSessionId: sessionId,
    })
    expect(repository.touchSession).not.toHaveBeenCalled()
  })

  it('fails authentication when a stale session is concurrently revoked during touch', async () => {
    const pair = await createTokenPair(userId, sessionId, config)
    repository.findValidSessionUser
      .mockResolvedValueOnce({ ...account(), session: { lastActiveAt: new Date(0) } })
      .mockResolvedValueOnce(undefined)
    repository.touchSession.mockResolvedValue(undefined)
    const service = createAuthService({} as never, config)
    await expect(service.me(pair.accessToken)).rejects.toBeInstanceOf(AuthUnauthorizedError)
  })

  it('prefers the access session over a different refresh session during logout', async () => {
    const accessPair = await createTokenPair(userId, sessionId, config)
    const refreshPair = await createTokenPair(
      userId,
      '69e33f4f-253f-421a-aef8-246cbfe278c0',
      config,
    )
    const service = createAuthService({} as never, config)
    await service.logout(accessPair.accessToken, refreshPair.refreshToken)
    expect(repository.revokeValidSession).toHaveBeenCalledTimes(1)
    expect(repository.revokeValidSession).toHaveBeenCalledWith(sessionId, userId, 'logout')
  })

  it('falls back to the refresh hash during logout and propagates database failures', async () => {
    const pair = await createTokenPair(userId, sessionId, config)
    const failure = new Error('database failed')
    repository.revokeValidSession.mockRejectedValue(failure)
    const service = createAuthService({} as never, config)
    await expect(service.logout(undefined, pair.refreshToken)).rejects.toBe(failure)
    expect(repository.revokeValidSession).toHaveBeenCalledWith(
      sessionId,
      userId,
      'logout',
      pair.refreshTokenHash,
    )
  })

  it('passes the verified credential snapshot and current session into password replacement', async () => {
    repository.findActiveUserCredentialById.mockResolvedValue(account())
    const service = createAuthService({} as never, config)
    await service.updatePassword(
      userId,
      sessionId,
      { currentPassword: 'old', newPassword: 'new-password' },
      metadata,
    )
    expect(repository.updatePasswordAndReplaceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        currentSessionId: sessionId,
        credentialHash: 'old-hash',
        passwordHash: 'new-hash',
      }),
    )
  })
})
