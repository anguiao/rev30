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
  AuthAccessTokenExpiredError,
  AuthInvalidCredentialsError,
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from './errors'
import { hashPassword, verifyPassword } from './password'
import { createAuthRepository } from './repository'
import { createUserAccessService } from './access'
import { createTokenPair, verifyAccessToken, verifyRefreshToken } from './tokens'

const dummyPasswordHash =
  'scrypt$rev30-auth-dummy-salt$gqCTp4XOR3Xf1LvfHOITCoogF-vpgXvmPkOuxWGr-ChkgWkyXG0_Zf19YMXZ_Oy3mXaxJAVa2LGtlr8sJPJDjA'

type AuthSession = AuthTokenResponse & {
  refreshToken: string
}

type AuthSessionTokens = {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

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
  const accessService = createUserAccessService(database)

  async function createTokenResponse(userId: string): Promise<AuthSessionTokens> {
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

  async function createAuthSession(
    userId: string,
    user: AuthTokenResponse['user'],
  ): Promise<AuthSession> {
    const access = await accessService.resolveUserAccess(userId)
    const tokens = await createTokenResponse(userId)

    return {
      ...tokens,
      user,
      accessCodes: access.accessCodes,
      menus: access.menus,
    }
  }

  return {
    async register(input: AuthRegisterInput): Promise<AuthSession> {
      const passwordHash = await hashPassword(input.password)
      const created = await withUserUniqueConflict(() => repository.createUser(input, passwordHash))
      const user = toUser(created.user, created.departments, created.roles)

      return createAuthSession(created.user.id, user)
    },

    async login(input: AuthLoginInput): Promise<AuthSession> {
      const account = await repository.findActiveUserCredentialByUsername(input.username)
      const passwordHash = account?.credential.passwordHash ?? dummyPasswordHash
      const passwordMatches = await verifyPassword(input.password, passwordHash)

      if (!account || account.user.status !== USER_STATUS_ENABLED || !passwordMatches) {
        throw new AuthInvalidCredentialsError()
      }

      const user = toUser(account.user, account.departments, account.roles)

      return createAuthSession(account.user.id, user)
    },

    async refresh(refreshToken: string | undefined): Promise<AuthSession> {
      if (!refreshToken) {
        throw new AuthInvalidRefreshTokenError()
      }

      const verified = await verifyRefreshToken(refreshToken, config)

      const consumed = await repository.consumeRefreshSession(verified.refreshTokenHash)

      if (!consumed) {
        throw new AuthInvalidRefreshTokenError()
      }

      const account = await repository.findActiveUserById(verified.userId)

      if (!account || account.user.status !== USER_STATUS_ENABLED) {
        throw new AuthInvalidRefreshTokenError()
      }

      const user = toUser(account.user, account.departments, account.roles)

      return createAuthSession(account.user.id, user)
    },

    async logout(refreshToken: string | undefined) {
      if (!refreshToken) {
        return
      }

      let verified: Awaited<ReturnType<typeof verifyRefreshToken>>

      try {
        verified = await verifyRefreshToken(refreshToken, config)
      } catch (error) {
        if (error instanceof AuthInvalidRefreshTokenError) {
          return
        }

        throw error
      }

      await repository.revokeRefreshSession(verified.refreshTokenHash)
    },

    async me(accessToken: string | undefined) {
      if (!accessToken) {
        throw new AuthUnauthorizedError()
      }

      let verified: Awaited<ReturnType<typeof verifyAccessToken>>

      try {
        verified = await verifyAccessToken(accessToken, config)
      } catch (error) {
        if (error instanceof AuthAccessTokenExpiredError) {
          throw error
        }

        throw new AuthUnauthorizedError()
      }

      const account = await repository.findActiveUserById(verified.userId)

      if (!account || account.user.status !== USER_STATUS_ENABLED) {
        throw new AuthUnauthorizedError()
      }

      const user = toUser(account.user, account.departments, account.roles)
      const access = await accessService.resolveUserAccess(account.user.id)

      return {
        user,
        accessCodes: access.accessCodes,
        menus: access.menus,
        isAdmin: access.isAdmin,
      }
    },
  }
}
