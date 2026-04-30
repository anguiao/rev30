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
import {
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from './errors'
import { hashPassword, verifyPassword } from './password'
import { createAuthRepository } from './repository'
import { createTokenPair, verifyAccessToken, verifyRefreshToken } from './tokens'

const dummyPasswordHash =
  'scrypt$rev30-auth-dummy-salt$gqCTp4XOR3Xf1LvfHOITCoogF-vpgXvmPkOuxWGr-ChkgWkyXG0_Zf19YMXZ_Oy3mXaxJAVa2LGtlr8sJPJDjA'

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
      const passwordHash = account?.credential.passwordHash ?? dummyPasswordHash
      const passwordMatches = await verifyPassword(input.password, passwordHash)

      if (!account || account.user.status !== USER_STATUS_ENABLED || !passwordMatches) {
        throw new AuthInvalidCredentialsError()
      }

      const tokens = await createTokenResponse(account.user.id)

      return {
        user: toUser(account.user),
        ...tokens,
      }
    },

    async refresh(refreshToken: string | undefined): Promise<AuthTokenResponse> {
      if (!refreshToken) {
        throw new AuthInvalidRefreshTokenError()
      }

      let verified: Awaited<ReturnType<typeof verifyRefreshToken>>

      try {
        verified = await verifyRefreshToken(refreshToken, config)
      } catch {
        throw new AuthInvalidRefreshTokenError()
      }

      const consumed = await repository.consumeRefreshSession(verified.refreshTokenHash)

      if (!consumed) {
        throw new AuthInvalidRefreshTokenError()
      }

      const user = await repository.findActiveUserById(verified.userId)

      if (!user || user.status !== USER_STATUS_ENABLED) {
        throw new AuthInvalidRefreshTokenError()
      }

      const tokens = await createTokenResponse(user.id)

      return {
        user: toUser(user),
        ...tokens,
      }
    },

    async logout(refreshToken: string | undefined) {
      if (!refreshToken) {
        return
      }

      try {
        const verified = await verifyRefreshToken(refreshToken, config)

        await repository.revokeRefreshSession(verified.refreshTokenHash)
      } catch {
        return
      }
    },

    async me(accessToken: string | undefined) {
      if (!accessToken) {
        throw new AuthUnauthorizedError()
      }

      let verified: Awaited<ReturnType<typeof verifyAccessToken>>

      try {
        verified = await verifyAccessToken(accessToken, config)
      } catch {
        throw new AuthUnauthorizedError()
      }

      const user = await repository.findActiveUserById(verified.userId)

      if (!user || user.status !== USER_STATUS_ENABLED) {
        throw new AuthUnauthorizedError()
      }

      return toUser(user)
    },
  }
}
