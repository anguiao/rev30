import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthConfig } from '../../../src/modules/auth/config'
import { AuthInvalidCredentialsError } from '../../../src/modules/auth/errors'
import { createAuthService } from '../../../src/modules/auth/service'
import { createTokenPair } from '../../../src/modules/auth/tokens'

const mocks = vi.hoisted(() => {
  const repository = {
    consumeRefreshSession: vi.fn(),
    createRefreshSession: vi.fn(),
    createUser: vi.fn(),
    findActiveUserById: vi.fn(),
    findActiveUserCredentialByUsername: vi.fn(),
    revokeRefreshSession: vi.fn(),
  }

  return {
    createAuthRepository: vi.fn(() => repository),
    repository,
    verifyPassword: vi.fn(),
  }
})

vi.mock('../../../src/modules/auth/repository', () => ({
  createAuthRepository: mocks.createAuthRepository,
}))

vi.mock('../../../src/modules/auth/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: mocks.verifyPassword,
}))

const config: AuthConfig = {
  accessSecret: 'test-access-secret',
  refreshSecret: 'test-refresh-secret',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 604800,
  secureCookies: false,
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
    vi.clearAllMocks()
    mocks.verifyPassword.mockResolvedValue(false)
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
  })

  it('does not hide refresh session revoke failures during logout', async () => {
    const pair = await createTokenPair('8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7', config)
    const error = new Error('revoke failed')
    mocks.repository.revokeRefreshSession.mockRejectedValue(error)

    const service = createAuthService({} as never, config)

    await expect(service.logout(pair.refreshToken)).rejects.toBe(error)
  })
})
