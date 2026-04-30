import {
  USER_STATUS_ENABLED,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthTokenResponse,
} from '@rev30/shared'
import type { Db } from '../../db'
import { toUserConflictError } from '../system/users/errors'
import { toUser } from '../system/users/mapper'
import type { AuthConfig } from './config'
import { AuthInvalidCredentialsError } from './errors'
import { hashPassword, verifyPassword } from './password'
import { createAuthRepository } from './repository'
import { createTokenPair } from './tokens'

async function withUserUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toUserConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

export function createAuthService(database: Db, config: AuthConfig) {
  const repository = createAuthRepository(database)

  async function createTokenResponse(userId: string): Promise<Omit<AuthTokenResponse, 'user'>> {
    const tokenPair = await createTokenPair(userId, config)

    await repository.createRefreshSession({
      userId,
      tokenHash: tokenPair.refreshTokenHash,
      expiresAt: tokenPair.refreshExpiresAt,
    })

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokenPair.accessExpiresIn,
    }
  }

  return {
    async register(input: AuthRegisterInput): Promise<AuthTokenResponse> {
      const passwordHash = await hashPassword(input.password)
      const created = await withUserUniqueConflict(() => repository.createUser(input, passwordHash))
      const tokens = await createTokenResponse(created.id)

      return {
        user: toUser(created),
        ...tokens,
      }
    },

    async login(input: AuthLoginInput): Promise<AuthTokenResponse> {
      const account = await repository.findActiveUserCredentialByUsername(input.username)

      if (
        !account ||
        account.user.status !== USER_STATUS_ENABLED ||
        !(await verifyPassword(input.password, account.credential.passwordHash))
      ) {
        throw new AuthInvalidCredentialsError()
      }

      const tokens = await createTokenResponse(account.user.id)

      return {
        user: toUser(account.user),
        ...tokens,
      }
    },
  }
}
