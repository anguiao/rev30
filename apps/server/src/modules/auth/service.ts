import { randomUUID } from 'node:crypto'
import {
  USER_STATUS_ENABLED,
  type AuthLoginInput,
  type AuthPasswordUpdateInput,
  type AuthProfileUpdateInput,
} from '@rev30/contracts'
import { subSeconds } from '@rev30/utils'
import type { Db } from '../../db'
import { createAttachmentAccessToken } from '../attachments/access-token'
import { toUserConflictError, toUserInvalidAvatarError } from '../system/users/errors'
import { toUser } from '../system/users/mapper'
import { readNumberConfigValue } from '../system/configs/values'
import { createUserAccessService } from './access'
import type { AuthConfig } from './config'
import {
  AuthAccessTokenExpiredError,
  AuthInvalidAccessTokenError,
  AuthInvalidCredentialsError,
  AuthInvalidCurrentPasswordError,
  AuthInvalidRefreshTokenError,
  AuthLoginRateLimitedError,
  AuthUnauthorizedError,
} from './errors'
import { hashPassword, verifyPassword } from './password'
import { createAuthRepository, type LoginRequestMetadata } from './repository'
import {
  createTokenPair,
  verifyAccessToken,
  verifyAccessTokenAllowExpired,
  verifyRefreshToken,
} from './tokens'

const dummyPasswordHash =
  'scrypt$rev30-auth-dummy-salt$gqCTp4XOR3Xf1LvfHOITCoogF-vpgXvmPkOuxWGr-ChkgWkyXG0_Zf19YMXZ_Oy3mXaxJAVa2LGtlr8sJPJDjA'

async function withUserWriteConstraints<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const conflict = toUserConflictError(error)
    if (conflict) throw conflict
    const invalidAvatar = toUserInvalidAvatarError(error)
    if (invalidAvatar) throw invalidAvatar
    throw error
  }
}

function isLoginAttemptLocked(bucket: { lockedUntil: Date | null } | undefined, now: Date) {
  return (
    bucket?.lockedUntil !== null && bucket?.lockedUntil !== undefined && bucket.lockedUntil > now
  )
}

async function readLoginFailureConfig(database: Db) {
  const [maxAttempts, windowSeconds, lockSeconds] = await Promise.all([
    readNumberConfigValue(database, 'auth.loginFailureMaxAttempts'),
    readNumberConfigValue(database, 'auth.loginFailureWindowSeconds'),
    readNumberConfigValue(database, 'auth.loginFailureLockSeconds'),
  ])
  return { maxAttempts, windowSeconds, lockSeconds }
}

export function createAuthService(database: Db, config: AuthConfig) {
  const repository = createAuthRepository(database)
  const accessService = createUserAccessService(database)

  async function createTokens(userId: string, sessionId: string, issuedAt: Date) {
    const pair = await createTokenPair(userId, sessionId, config, issuedAt)
    const attachmentAccessToken = await createAttachmentAccessToken(
      userId,
      sessionId,
      config,
      issuedAt,
    )
    return { ...pair, attachmentAccessToken }
  }

  async function recordOrdinaryFailure(
    input: AuthLoginInput,
    metadata: LoginRequestMetadata,
    userId: string | null,
    reason: 'invalid_credentials' | 'account_disabled',
    now: Date,
  ) {
    const limits = await readLoginFailureConfig(database)
    await repository.recordLoginFailure({
      username: input.username,
      userId,
      failureReason: reason,
      metadata,
      now,
      ...limits,
    })
  }

  return {
    async login(input: AuthLoginInput, metadata: LoginRequestMetadata) {
      const attemptedAt = new Date()
      const bucket = await repository.findLoginAttemptBucketByUsername(input.username)
      if (isLoginAttemptLocked(bucket, attemptedAt)) {
        await repository.recordRateLimitedLogin(input.username, metadata, attemptedAt)
        throw new AuthLoginRateLimitedError()
      }

      const account = await repository.findActiveUserCredentialByUsername(input.username)
      const matches = await verifyPassword(
        input.password,
        account?.credential.passwordHash ?? dummyPasswordHash,
      )
      if (!account || !matches || account.user.status !== USER_STATUS_ENABLED) {
        const reason =
          account && account.user.status !== USER_STATUS_ENABLED
            ? 'account_disabled'
            : 'invalid_credentials'
        await recordOrdinaryFailure(input, metadata, account?.user.id ?? null, reason, attemptedAt)
        throw new AuthInvalidCredentialsError()
      }

      const user = toUser(account.user, account.departments, account.roles)
      const access = await accessService.resolveUserAccess(user.id)
      const sessionId = randomUUID()
      const sessionCreatedAt = new Date()
      const tokens = await createTokens(user.id, sessionId, sessionCreatedAt)
      const result = await repository.createLoginSession({
        id: sessionId,
        userId: user.id,
        username: input.username,
        credentialHash: account.credential.passwordHash,
        refreshTokenHash: tokens.refreshTokenHash,
        expiresAt: tokens.refreshExpiresAt,
        metadata,
        now: sessionCreatedAt,
      })
      if (result !== 'success') {
        await recordOrdinaryFailure(input, metadata, user.id, result, new Date())
        throw new AuthInvalidCredentialsError()
      }
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        attachmentAccessToken: tokens.attachmentAccessToken,
        tokenType: 'Bearer' as const,
        expiresIn: tokens.accessExpiresIn,
        user,
        accessCodes: access.accessCodes,
        menus: access.menus,
      }
    },

    async refresh(refreshToken: string | undefined, accessToken?: string) {
      if (!refreshToken) throw new AuthInvalidRefreshTokenError()
      const verified = await verifyRefreshToken(refreshToken, config)
      if (accessToken) {
        try {
          const access = await verifyAccessTokenAllowExpired(accessToken, config)
          if (access.userId !== verified.userId || access.sessionId !== verified.sessionId)
            throw new AuthInvalidRefreshTokenError()
        } catch (error) {
          if (error instanceof AuthInvalidRefreshTokenError) throw error
          throw new AuthInvalidRefreshTokenError()
        }
      }
      const account = await repository.findActiveUserById(verified.userId)
      if (!account || account.user.status !== USER_STATUS_ENABLED)
        throw new AuthInvalidRefreshTokenError()
      const user = toUser(account.user, account.departments, account.roles)
      const access = await accessService.resolveUserAccess(user.id)
      const now = new Date()
      const tokens = await createTokens(user.id, verified.sessionId, now)
      const rotated = await repository.rotateSession({
        id: verified.sessionId,
        userId: user.id,
        oldHash: verified.refreshTokenHash,
        newHash: tokens.refreshTokenHash,
        expiresAt: tokens.refreshExpiresAt,
        now,
      })
      if (!rotated) throw new AuthInvalidRefreshTokenError()
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        attachmentAccessToken: tokens.attachmentAccessToken,
        tokenType: 'Bearer' as const,
        expiresIn: tokens.accessExpiresIn,
        user,
        accessCodes: access.accessCodes,
        menus: access.menus,
      }
    },

    async logout(accessToken: string | undefined, refreshToken: string | undefined) {
      if (accessToken) {
        try {
          const access = await verifyAccessToken(accessToken, config)
          const revoked = await repository.revokeValidSession(
            access.sessionId,
            access.userId,
            'logout',
          )
          if (revoked) return
        } catch (error) {
          if (
            !(
              error instanceof AuthInvalidAccessTokenError ||
              error instanceof AuthAccessTokenExpiredError
            )
          )
            throw error
        }
      }
      if (!refreshToken) return
      try {
        const refresh = await verifyRefreshToken(refreshToken, config)
        await repository.revokeValidSession(
          refresh.sessionId,
          refresh.userId,
          'logout',
          refresh.refreshTokenHash,
        )
      } catch (error) {
        if (!(error instanceof AuthInvalidRefreshTokenError)) throw error
      }
    },

    async me(accessToken: string | undefined) {
      if (!accessToken) throw new AuthUnauthorizedError()
      let verified: Awaited<ReturnType<typeof verifyAccessToken>>
      try {
        verified = await verifyAccessToken(accessToken, config)
      } catch (error) {
        if (error instanceof AuthAccessTokenExpiredError) throw error
        throw new AuthUnauthorizedError()
      }
      const now = new Date()
      let account = await repository.findValidSessionUser(verified.sessionId, verified.userId, now)
      if (!account) throw new AuthUnauthorizedError()
      if (account.session.lastActiveAt <= subSeconds(now, 300)) {
        const touched = await repository.touchSession(
          verified.sessionId,
          verified.userId,
          subSeconds(now, 300),
          now,
        )
        if (!touched) {
          account = await repository.findValidSessionUser(verified.sessionId, verified.userId, now)
          if (!account) throw new AuthUnauthorizedError()
        }
      }
      const user = toUser(account.user, account.departments, account.roles)
      const access = await accessService.resolveUserAccess(user.id)
      return {
        user,
        currentSessionId: verified.sessionId,
        accessCodes: access.accessCodes,
        menus: access.menus,
        isAdmin: access.isAdmin,
      }
    },

    async updateProfile(userId: string, input: AuthProfileUpdateInput) {
      const updated = await withUserWriteConstraints(() =>
        repository.updateUserProfile(userId, input),
      )
      if (!updated || updated.user.status !== USER_STATUS_ENABLED) throw new AuthUnauthorizedError()
      return toUser(updated.user, updated.departments, updated.roles)
    },

    async updatePassword(
      userId: string,
      currentSessionId: string,
      input: AuthPasswordUpdateInput,
      metadata: LoginRequestMetadata,
    ) {
      const account = await repository.findActiveUserCredentialById(userId)
      if (!account || account.user.status !== USER_STATUS_ENABLED) throw new AuthUnauthorizedError()
      if (!(await verifyPassword(input.currentPassword, account.credential.passwordHash)))
        throw new AuthInvalidCurrentPasswordError()
      const user = toUser(account.user, account.departments, account.roles)
      const access = await accessService.resolveUserAccess(user.id)
      const passwordHash = await hashPassword(input.newPassword)
      const now = new Date()
      const sessionId = randomUUID()
      const tokens = await createTokens(userId, sessionId, now)
      const updated = await repository.updatePasswordAndReplaceSession({
        userId,
        currentSessionId,
        credentialHash: account.credential.passwordHash,
        passwordHash,
        newSession: {
          id: sessionId,
          userId,
          refreshTokenHash: tokens.refreshTokenHash,
          expiresAt: tokens.refreshExpiresAt,
          metadata,
          now,
        },
      })
      if (!updated) throw new AuthUnauthorizedError()
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        attachmentAccessToken: tokens.attachmentAccessToken,
        tokenType: 'Bearer' as const,
        expiresIn: tokens.accessExpiresIn,
        user,
        accessCodes: access.accessCodes,
        menus: access.menus,
      }
    },
  }
}
