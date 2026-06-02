import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthConfig } from '../../../src/modules/auth/config'
import {
  AuthInvalidCredentialsError,
  AuthLoginRateLimitedError,
} from '../../../src/modules/auth/errors'
import { createAuthService } from '../../../src/modules/auth/service'
import { createTokenPair } from '../../../src/modules/auth/tokens'

const mocks = vi.hoisted(() => {
  const repository = {
    clearLoginAttemptBucket: vi.fn(),
    consumeRefreshSession: vi.fn(),
    createRefreshSession: vi.fn(),
    findActiveUserById: vi.fn(),
    findActiveUserCredentialByUsername: vi.fn(),
    findLoginAttemptBucketByUsername: vi.fn(),
    recordLoginFailure: vi.fn(),
    revokeRefreshSession: vi.fn(),
  }

  return {
    createAuthRepository: vi.fn(() => repository),
    repository,
    verifyPassword: vi.fn(),
    resolveUserAccess: vi.fn(),
  }
})

vi.mock('../../../src/modules/auth/repository', () => ({
  createAuthRepository: mocks.createAuthRepository,
}))

vi.mock('../../../src/modules/auth/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: mocks.verifyPassword,
}))

vi.mock('../../../src/modules/auth/access', () => ({
  createUserAccessService: () => ({
    resolveUserAccess: mocks.resolveUserAccess,
  }),
}))

const config: AuthConfig = {
  accessSecret: 'test-access-secret',
  refreshSecret: 'test-refresh-secret',
  attachmentSecret: 'test-attachment-secret',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  attachmentExpiresInSeconds: 86400,
  secureCookies: false,
  loginFailureMaxAttempts: 5,
  loginFailureWindowSeconds: 900,
  loginFailureLockSeconds: 900,
}

function createUserRow(status = USER_STATUS_ENABLED) {
  const now = new Date('2026-04-30T00:00:00.000Z')

  return {
    id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
    username: 'ada',
    nickname: 'Ada Lovelace',
    email: null,
    phone: null,
    status,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

describe('auth service', () => {
  beforeEach(() => {
    mocks.repository.clearLoginAttemptBucket.mockReset()
    mocks.repository.consumeRefreshSession.mockReset()
    mocks.repository.createRefreshSession.mockReset()
    mocks.repository.findActiveUserById.mockReset()
    mocks.repository.findActiveUserCredentialByUsername.mockReset()
    mocks.repository.findLoginAttemptBucketByUsername.mockReset()
    mocks.repository.recordLoginFailure.mockReset()
    mocks.repository.revokeRefreshSession.mockReset()
    mocks.createAuthRepository.mockClear()
    mocks.createAuthRepository.mockImplementation(() => mocks.repository)
    mocks.repository.findLoginAttemptBucketByUsername.mockResolvedValue(undefined)
    mocks.verifyPassword.mockResolvedValue(false)
    mocks.verifyPassword.mockClear()
    mocks.resolveUserAccess.mockResolvedValue({
      accessCodes: [],
      menus: [],
      isAdmin: false,
    })
    mocks.resolveUserAccess.mockClear()
  })

  it('uses password verification work for unknown-user login failures', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue(undefined)

    const service = createAuthService({} as never, config)

    await expect(
      service.login({
        username: 'missing',
        password: 'secret-password',
      }),
    ).rejects.toBeInstanceOf(AuthInvalidCredentialsError)
    expect(mocks.verifyPassword).toHaveBeenCalledOnce()
    expect(mocks.verifyPassword).toHaveBeenCalledWith('secret-password', expect.any(String))
  })

  it('records failed login attempts for unknown users', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue(undefined)
    mocks.repository.findLoginAttemptBucketByUsername.mockResolvedValue(undefined)

    const service = createAuthService({} as never, config)

    await expect(
      service.login({
        username: 'missing',
        password: 'secret-password',
      }),
    ).rejects.toBeInstanceOf(AuthInvalidCredentialsError)

    expect(mocks.repository.recordLoginFailure).toHaveBeenCalledWith({
      username: 'missing',
      now: expect.any(Date),
      maxAttempts: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    })
  })

  it('rejects locked login attempts before password verification', async () => {
    mocks.repository.findLoginAttemptBucketByUsername.mockResolvedValue({
      username: 'ada',
      failedCount: 5,
      windowStartedAt: new Date('2026-05-14T00:00:00.000Z'),
      lastFailedAt: new Date('2026-05-14T00:00:00.000Z'),
      lockedUntil: new Date(Date.now() + 60_000),
      createdAt: new Date('2026-05-14T00:00:00.000Z'),
      updatedAt: new Date('2026-05-14T00:00:00.000Z'),
    })

    const service = createAuthService({} as never, config)

    await expect(
      service.login({
        username: 'ada',
        password: 'secret-password',
      }),
    ).rejects.toBeInstanceOf(AuthLoginRateLimitedError)

    expect(mocks.verifyPassword).not.toHaveBeenCalled()
    expect(mocks.repository.createRefreshSession).not.toHaveBeenCalled()
  })

  it('clears failed login attempts after successful login', async () => {
    mocks.repository.findLoginAttemptBucketByUsername.mockResolvedValue({
      username: 'ada',
      failedCount: 2,
      windowStartedAt: new Date('2026-05-14T00:00:00.000Z'),
      lastFailedAt: new Date('2026-05-14T00:01:00.000Z'),
      lockedUntil: null,
      createdAt: new Date('2026-05-14T00:00:00.000Z'),
      updatedAt: new Date('2026-05-14T00:01:00.000Z'),
    })
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue({
      credential: {
        userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        passwordHash: 'stored-password-hash',
        createdAt: new Date('2026-04-30T00:00:00.000Z'),
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      departments: [],
      roles: [],
      user: createUserRow(),
    })
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.repository.createRefreshSession.mockResolvedValue(undefined)

    const service = createAuthService({} as never, config)
    await service.login({
      username: 'ada',
      password: 'secret-password',
    })

    expect(mocks.repository.clearLoginAttemptBucket).toHaveBeenCalledWith('ada', expect.any(Date))
  })

  it('uses password verification work for disabled-user login failures', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue({
      credential: {
        userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        passwordHash: 'stored-password-hash',
        createdAt: new Date('2026-04-30T00:00:00.000Z'),
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      departments: [],
      roles: [],
      user: createUserRow(USER_STATUS_DISABLED),
    })

    const service = createAuthService({} as never, config)

    await expect(
      service.login({
        username: 'ada',
        password: 'secret-password',
      }),
    ).rejects.toBeInstanceOf(AuthInvalidCredentialsError)
    expect(mocks.verifyPassword).toHaveBeenCalledOnce()
    expect(mocks.verifyPassword).toHaveBeenCalledWith('secret-password', 'stored-password-hash')
  })

  it('returns role summaries on successful login', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue({
      credential: {
        userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        passwordHash: 'stored-password-hash',
        createdAt: new Date('2026-04-30T00:00:00.000Z'),
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      departments: [],
      roles: [
        {
          id: '7928ee64-90d3-4b9c-9931-a5db58f8bd2e',
          name: 'Administrator',
          code: 'admin',
        },
      ],
      user: createUserRow(),
    })
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.repository.createRefreshSession.mockResolvedValue(undefined)

    const service = createAuthService({} as never, config)
    const session = await service.login({
      username: 'ada',
      password: 'secret-password',
    })

    expect(session.user.roles).toEqual([
      {
        id: '7928ee64-90d3-4b9c-9931-a5db58f8bd2e',
        name: 'Administrator',
        code: 'admin',
      },
    ])
    expect(session.accessCodes).toEqual([])
    expect(session.menus).toEqual([])
  })

  it('returns access codes and menus for login sessions', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue({
      credential: {
        userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        passwordHash: 'stored-password-hash',
        createdAt: new Date('2026-04-30T00:00:00.000Z'),
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      departments: [],
      roles: [],
      user: createUserRow(),
    })
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.repository.createRefreshSession.mockResolvedValue(undefined)

    const accessData = {
      accessCodes: ['system'],
      menus: [
        {
          id: 'system-id',
          parentId: null,
          type: 'directory',
          name: 'System',
          code: 'system',
          path: null,
          externalUrl: null,
          openTarget: 'self',
          icon: 'lucide:settings',
          hidden: false,
          status: 1,
          sortOrder: 0,
          createdAt: '2026-05-06T00:00:00.000Z',
          updatedAt: '2026-05-06T00:00:00.000Z',
          children: [],
        },
      ],
      isAdmin: false,
    }

    mocks.resolveUserAccess.mockResolvedValue(accessData)

    const service = createAuthService({} as never, config)
    const session = await service.login({
      username: 'ada',
      password: 'secret-password',
    })

    expect(session.accessCodes).toEqual(accessData.accessCodes)
    expect(session.menus).toEqual(accessData.menus)
    expect(mocks.resolveUserAccess).toHaveBeenCalledTimes(1)
    expect(mocks.resolveUserAccess).toHaveBeenCalledWith('8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7')
  })

  it('does not create a refresh session when access resolution fails', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue({
      credential: {
        userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        passwordHash: 'stored-password-hash',
        createdAt: new Date('2026-04-30T00:00:00.000Z'),
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      departments: [],
      roles: [],
      user: createUserRow(),
    })
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.repository.createRefreshSession.mockResolvedValue(undefined)
    const accessError = new Error('access resolution failed')
    mocks.resolveUserAccess.mockRejectedValue(accessError)

    const service = createAuthService({} as never, config)
    await expect(
      service.login({
        username: 'ada',
        password: 'secret-password',
      }),
    ).rejects.toBe(accessError)

    expect(mocks.repository.createRefreshSession).not.toHaveBeenCalled()
    expect(mocks.repository.clearLoginAttemptBucket).not.toHaveBeenCalled()
  })

  it('does not clear failed login attempts when refresh session creation fails', async () => {
    mocks.repository.findActiveUserCredentialByUsername.mockResolvedValue({
      credential: {
        userId: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
        passwordHash: 'stored-password-hash',
        createdAt: new Date('2026-04-30T00:00:00.000Z'),
        updatedAt: new Date('2026-04-30T00:00:00.000Z'),
      },
      departments: [],
      roles: [],
      user: createUserRow(),
    })
    mocks.verifyPassword.mockResolvedValue(true)
    const sessionError = new Error('create refresh session failed')
    mocks.repository.createRefreshSession.mockRejectedValue(sessionError)

    const service = createAuthService({} as never, config)
    await expect(
      service.login({
        username: 'ada',
        password: 'secret-password',
      }),
    ).rejects.toBe(sessionError)

    expect(mocks.repository.clearLoginAttemptBucket).not.toHaveBeenCalled()
  })

  it('does not hide refresh session revoke failures during logout', async () => {
    const pair = await createTokenPair('8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7', config)
    const error = new Error('revoke failed')
    mocks.repository.revokeRefreshSession.mockRejectedValue(error)

    const service = createAuthService({} as never, config)

    await expect(service.logout(pair.refreshToken)).rejects.toBe(error)
  })
})
