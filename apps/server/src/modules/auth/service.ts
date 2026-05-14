import {
  USER_STATUS_ENABLED,
  type AuthLoginInput,
  type AuthPasswordUpdateInput,
  type AuthProfileUpdateInput,
  type AuthTokenResponse,
  type User,
} from '@rev30/shared'
import type { Db } from '../../db'
import { toUserConflictError } from '../system/users/errors'
import { toUser } from '../system/users/mapper'
import type { AuthConfig } from './config'
import {
  AuthAccessTokenExpiredError,
  AuthInvalidCredentialsError,
  AuthInvalidCurrentPasswordError,
  AuthLoginRateLimitedError,
  AuthInvalidRefreshTokenError,
  AuthUnauthorizedError,
} from './errors'
import { hashPassword, verifyPassword } from './password'
import { createAuthRepository } from './repository'
import { createUserAccessService } from './access'
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

function isLoginAttemptLocked(bucket: { lockedUntil: Date | null } | undefined, now: Date) {
  return (
    bucket?.lockedUntil !== null && bucket?.lockedUntil !== undefined && bucket.lockedUntil > now
  )
}

export function createAuthService(database: Db, config: AuthConfig) {
  const repository = createAuthRepository(database)
  const accessService = createUserAccessService(database)

  async function createTokenResponse(userId: string) {
    const tokenPair = await createTokenPair(userId, config)

    await repository.createRefreshSession({
      userId,
      tokenHash: tokenPair.refreshTokenHash,
      expiresAt: tokenPair.refreshExpiresAt,
    })

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn: tokenPair.accessExpiresIn,
    }
  }

  async function createAuthSession(
    user: User,
  ): Promise<AuthTokenResponse & { refreshToken: string }> {
    const access = await accessService.resolveUserAccess(user.id)
    const tokens = await createTokenResponse(user.id)

    return {
      ...tokens,
      user,
      accessCodes: access.accessCodes,
      menus: access.menus,
    }
  }

  return {
    async login(input: AuthLoginInput) {
      const now = new Date()
      const bucket = await repository.findLoginAttemptBucketByUsername(input.username)

      if (isLoginAttemptLocked(bucket, now)) {
        throw new AuthLoginRateLimitedError()
      }

      const account = await repository.findActiveUserCredentialByUsername(input.username)
      const passwordHash = account?.credential.passwordHash ?? dummyPasswordHash
      const passwordMatches = await verifyPassword(input.password, passwordHash)

      if (!account || account.user.status !== USER_STATUS_ENABLED || !passwordMatches) {
        await repository.recordLoginFailure({
          username: input.username,
          now,
          maxAttempts: config.loginFailureMaxAttempts,
          windowSeconds: config.loginFailureWindowSeconds,
          lockSeconds: config.loginFailureLockSeconds,
        })
        throw new AuthInvalidCredentialsError()
      }

      const user = toUser(account.user, account.departments, account.roles)
      const session = await createAuthSession(user)
      await repository.clearLoginAttemptBucket(input.username)

      return session
    },

    async refresh(refreshToken: string | undefined) {
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

      return createAuthSession(user)
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

    async updateProfile(userId: string, input: AuthProfileUpdateInput) {
      const updated = await withUserUniqueConflict(() =>
        repository.updateUserProfile(userId, input),
      )

      if (!updated || updated.user.status !== USER_STATUS_ENABLED) {
        throw new AuthUnauthorizedError()
      }

      return toUser(updated.user, updated.departments, updated.roles)
    },

    async updatePassword(
      userId: string,
      input: AuthPasswordUpdateInput,
      refreshToken: string | undefined,
    ) {
      const account = await repository.findActiveUserCredentialById(userId)

      if (!account || account.user.status !== USER_STATUS_ENABLED) {
        throw new AuthUnauthorizedError()
      }

      const passwordMatches = await verifyPassword(
        input.currentPassword,
        account.credential.passwordHash,
      )

      if (!passwordMatches) {
        throw new AuthInvalidCurrentPasswordError()
      }

      let currentTokenHash: string | undefined

      if (refreshToken) {
        try {
          currentTokenHash = (await verifyRefreshToken(refreshToken, config)).refreshTokenHash
        } catch (error) {
          if (!(error instanceof AuthInvalidRefreshTokenError)) {
            throw error
          }
        }
      }

      const passwordHash = await hashPassword(input.newPassword)
      const updatedCredential = await repository.updatePasswordCredentialAndRevokeSessions(
        userId,
        passwordHash,
        currentTokenHash,
      )

      if (!updatedCredential) {
        throw new AuthUnauthorizedError()
      }
    },
  }
}
