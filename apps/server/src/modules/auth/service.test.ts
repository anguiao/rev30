import { USER_STATUS_DISABLED, USER_STATUS_ENABLED } from '@rev30/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthConfig } from './config'
import { AuthInvalidCredentialsError } from './errors'
import { createAuthService } from './service'

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

vi.mock('./repository', () => ({
  createAuthRepository: mocks.createAuthRepository,
}))

vi.mock('./password', () => ({
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
})
