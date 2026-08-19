import {
  LOGIN_FAILURE_REASON_ACCOUNT_DISABLED,
  LOGIN_FAILURE_REASON_INVALID_CREDENTIALS,
  LOGIN_FAILURE_REASON_RATE_LIMITED,
  LOGIN_LOG_RESULT_FAILURE,
  LOGIN_LOG_RESULT_SUCCESS,
  USER_STATUS_ENABLED,
  type AuthProfileUpdateInput,
} from '@rev30/contracts'
import { addSeconds, subSeconds } from '@rev30/utils'
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'
import type { Db, DbReader } from '../../db'
import {
  authLoginAttemptBuckets,
  authPasswordCredentials,
  authSessions,
  opsLoginLogs,
  systemUsers,
} from '../../db/schema'
import type { ClientIpSource } from '../../runtime/trusted-proxy'
import { findDepartmentSummariesByUserId } from '../system/departments/repository'
import { findRoleSummariesByUserId } from '../system/roles/repository'

export type AuthRequestMetadata = {
  requestId: string
  clientIp: string | null
  clientIpSource: ClientIpSource
  userAgent: string | null
}
export type AuthSessionRevocationReason =
  | 'logout'
  | 'password_changed'
  | 'password_reset'
  | 'admin_forced'
  | 'user_disabled'
  | 'user_deleted'
type RecordLoginFailureInput = {
  username: string
  userId: string | null
  failureReason:
    | typeof LOGIN_FAILURE_REASON_INVALID_CREDENTIALS
    | typeof LOGIN_FAILURE_REASON_ACCOUNT_DISABLED
  metadata: AuthRequestMetadata
  now: Date
  maxAttempts: number
  windowSeconds: number
  lockSeconds: number
}
type SessionCreateInput = {
  id: string
  userId: string
  refreshTokenHash: string
  expiresAt: Date
  metadata: AuthRequestMetadata
  now: Date
}

async function findUserWithAccess(executor: DbReader, id: string) {
  const [user] = await executor
    .select()
    .from(systemUsers)
    .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
    .limit(1)
  if (!user) return undefined
  return {
    user,
    departments: await findDepartmentSummariesByUserId(executor, user.id),
    roles: await findRoleSummariesByUserId(executor, user.id),
  }
}

async function findValidSession(executor: DbReader, sessionId: string, userId: string, now: Date) {
  const [row] = await executor
    .select({ session: authSessions })
    .from(authSessions)
    .innerJoin(systemUsers, eq(systemUsers.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.id, sessionId),
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        eq(systemUsers.status, USER_STATUS_ENABLED),
        isNull(systemUsers.deletedAt),
      ),
    )
    .limit(1)

  return row?.session
}

function sessionValues(input: SessionCreateInput) {
  return {
    id: input.id,
    userId: input.userId,
    refreshTokenHash: input.refreshTokenHash,
    createdIp: input.metadata.clientIp,
    createdIpSource: input.metadata.clientIpSource,
    userAgent: input.metadata.userAgent,
    lastActiveAt: input.now,
    expiresAt: input.expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function createAuthRepository(database: Db) {
  return {
    async findActiveUserCredentialByUsername(username: string) {
      const [account] = await database
        .select({ user: systemUsers, credential: authPasswordCredentials })
        .from(systemUsers)
        .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, systemUsers.id))
        .where(and(eq(systemUsers.username, username), isNull(systemUsers.deletedAt)))
        .limit(1)
      if (!account) return undefined
      return {
        ...account,
        departments: await findDepartmentSummariesByUserId(database, account.user.id),
        roles: await findRoleSummariesByUserId(database, account.user.id),
      }
    },
    findActiveUserById(id: string) {
      return findUserWithAccess(database, id)
    },
    async findActiveUserCredentialById(userId: string) {
      const [account] = await database
        .select({ user: systemUsers, credential: authPasswordCredentials })
        .from(systemUsers)
        .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, systemUsers.id))
        .where(and(eq(systemUsers.id, userId), isNull(systemUsers.deletedAt)))
        .limit(1)
      if (!account) return undefined
      return {
        ...account,
        departments: await findDepartmentSummariesByUserId(database, account.user.id),
        roles: await findRoleSummariesByUserId(database, account.user.id),
      }
    },
    async updateUserProfile(userId: string, input: AuthProfileUpdateInput) {
      return database.transaction(async (tx) => {
        const [updated] = await tx
          .update(systemUsers)
          .set(input)
          .where(and(eq(systemUsers.id, userId), isNull(systemUsers.deletedAt)))
          .returning()
        if (!updated) return undefined
        return {
          user: updated,
          departments: await findDepartmentSummariesByUserId(tx, updated.id),
          roles: await findRoleSummariesByUserId(tx, updated.id),
        }
      })
    },
    async findLoginAttemptBucketByUsername(username: string) {
      const [bucket] = await database
        .select()
        .from(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, username))
        .limit(1)
      return bucket
    },
    async recordRateLimitedLogin(username: string, metadata: AuthRequestMetadata, now: Date) {
      await database.insert(opsLoginLogs).values({
        username,
        result: LOGIN_LOG_RESULT_FAILURE,
        failureReason: LOGIN_FAILURE_REASON_RATE_LIMITED,
        requestId: metadata.requestId,
        clientIp: metadata.clientIp,
        clientIpSource: metadata.clientIpSource,
        userAgent: metadata.userAgent,
        createdAt: now,
      })
    },
    async recordLoginFailureBucket(
      input: Omit<RecordLoginFailureInput, 'userId' | 'failureReason' | 'metadata'>,
    ) {
      const windowCutoff = subSeconds(input.now, input.windowSeconds)
      const lockUntil = addSeconds(input.now, input.lockSeconds)
      const activeLock = sql`(${authLoginAttemptBuckets.lockedUntil} is not null and ${authLoginAttemptBuckets.lockedUntil} > ${input.now})`
      const shouldReset = sql`((${authLoginAttemptBuckets.windowStartedAt} <= ${windowCutoff} and not ${activeLock}) or (${authLoginAttemptBuckets.lockedUntil} is not null and ${authLoginAttemptBuckets.lockedUntil} <= ${input.now}))`
      const nextCount = sql<number>`case when ${activeLock} then ${authLoginAttemptBuckets.failedCount} when ${shouldReset} then 1 else ${authLoginAttemptBuckets.failedCount} + 1 end`
      const [bucket] = await database
        .insert(authLoginAttemptBuckets)
        .values({
          username: input.username,
          failedCount: 1,
          windowStartedAt: input.now,
          lastFailedAt: input.now,
          lockedUntil: input.maxAttempts <= 1 ? lockUntil : null,
        })
        .onConflictDoUpdate({
          target: authLoginAttemptBuckets.username,
          set: {
            failedCount: nextCount,
            windowStartedAt: sql<Date>`case when ${activeLock} then ${authLoginAttemptBuckets.windowStartedAt} when ${shouldReset} then ${input.now} else ${authLoginAttemptBuckets.windowStartedAt} end`,
            lastFailedAt: input.now,
            lockedUntil: sql<Date | null>`case when ${activeLock} then ${authLoginAttemptBuckets.lockedUntil} when ${nextCount} >= ${input.maxAttempts} then ${lockUntil}::timestamptz else null::timestamptz end`,
            updatedAt: input.now,
          },
        })
        .returning()
      return bucket
    },
    async clearLoginAttemptBucket(username: string, now: Date) {
      await database
        .delete(authLoginAttemptBuckets)
        .where(
          and(
            eq(authLoginAttemptBuckets.username, username),
            or(
              isNull(authLoginAttemptBuckets.lockedUntil),
              lte(authLoginAttemptBuckets.lockedUntil, now),
            ),
          ),
        )
    },
    async recordLoginFailure(input: RecordLoginFailureInput) {
      await database.transaction(async (tx) => {
        const windowCutoff = subSeconds(input.now, input.windowSeconds)
        const lockUntil = addSeconds(input.now, input.lockSeconds)
        const activeLock = sql`(${authLoginAttemptBuckets.lockedUntil} is not null and ${authLoginAttemptBuckets.lockedUntil} > ${input.now})`
        const shouldReset = sql`((${authLoginAttemptBuckets.windowStartedAt} <= ${windowCutoff} and not ${activeLock}) or (${authLoginAttemptBuckets.lockedUntil} is not null and ${authLoginAttemptBuckets.lockedUntil} <= ${input.now}))`
        const nextCount = sql<number>`case when ${activeLock} then ${authLoginAttemptBuckets.failedCount} when ${shouldReset} then 1 else ${authLoginAttemptBuckets.failedCount} + 1 end`
        await tx
          .insert(authLoginAttemptBuckets)
          .values({
            username: input.username,
            failedCount: 1,
            windowStartedAt: input.now,
            lastFailedAt: input.now,
            lockedUntil: input.maxAttempts <= 1 ? lockUntil : null,
          })
          .onConflictDoUpdate({
            target: authLoginAttemptBuckets.username,
            set: {
              failedCount: nextCount,
              windowStartedAt: sql<Date>`case when ${activeLock} then ${authLoginAttemptBuckets.windowStartedAt} when ${shouldReset} then ${input.now} else ${authLoginAttemptBuckets.windowStartedAt} end`,
              lastFailedAt: input.now,
              lockedUntil: sql<Date | null>`case when ${activeLock} then ${authLoginAttemptBuckets.lockedUntil} when ${nextCount} >= ${input.maxAttempts} then ${lockUntil}::timestamptz else null::timestamptz end`,
              updatedAt: input.now,
            },
          })
        await tx.insert(opsLoginLogs).values({
          userId: input.userId,
          username: input.username,
          result: LOGIN_LOG_RESULT_FAILURE,
          failureReason: input.failureReason,
          requestId: input.metadata.requestId,
          clientIp: input.metadata.clientIp,
          clientIpSource: input.metadata.clientIpSource,
          userAgent: input.metadata.userAgent,
          createdAt: input.now,
        })
      })
    },
    async createLoginSession(
      input: SessionCreateInput & { username: string; credentialHash: string },
    ) {
      return database.transaction(async (tx) => {
        const [account] = await tx
          .select({ user: systemUsers, credential: authPasswordCredentials })
          .from(systemUsers)
          .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, systemUsers.id))
          .where(and(eq(systemUsers.id, input.userId), isNull(systemUsers.deletedAt)))
          .limit(1)
          .for('update')
        if (!account || account.credential.passwordHash !== input.credentialHash)
          return LOGIN_FAILURE_REASON_INVALID_CREDENTIALS
        if (account.user.status !== USER_STATUS_ENABLED)
          return LOGIN_FAILURE_REASON_ACCOUNT_DISABLED
        await tx.insert(authSessions).values(sessionValues(input))
        await tx.insert(opsLoginLogs).values({
          userId: input.userId,
          username: input.username,
          result: LOGIN_LOG_RESULT_SUCCESS,
          sessionId: input.id,
          requestId: input.metadata.requestId,
          clientIp: input.metadata.clientIp,
          clientIpSource: input.metadata.clientIpSource,
          userAgent: input.metadata.userAgent,
          createdAt: input.now,
        })
        await tx
          .delete(authLoginAttemptBuckets)
          .where(
            and(
              eq(authLoginAttemptBuckets.username, input.username),
              or(
                isNull(authLoginAttemptBuckets.lockedUntil),
                lte(authLoginAttemptBuckets.lockedUntil, input.now),
              ),
            ),
          )
        return LOGIN_LOG_RESULT_SUCCESS
      })
    },
    findValidSession(sessionId: string, userId: string, now: Date) {
      return findValidSession(database, sessionId, userId, now)
    },
    async findValidSessionUser(sessionId: string, userId: string, now: Date) {
      const session = await findValidSession(database, sessionId, userId, now)
      if (!session) return undefined
      const withAccess = await findUserWithAccess(database, userId)
      return withAccess ? { session, ...withAccess } : undefined
    },
    async touchSession(sessionId: string, userId: string, threshold: Date, now: Date) {
      const [updated] = await database
        .update(authSessions)
        .set({ lastActiveAt: now, updatedAt: now })
        .where(
          and(
            eq(authSessions.id, sessionId),
            eq(authSessions.userId, userId),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
            lte(authSessions.lastActiveAt, threshold),
          ),
        )
        .returning({ id: authSessions.id })
      return updated
    },
    async rotateSession(input: {
      id: string
      userId: string
      oldHash: string
      newHash: string
      expiresAt: Date
      now: Date
    }) {
      const [updated] = await database
        .update(authSessions)
        .set({
          refreshTokenHash: input.newHash,
          expiresAt: input.expiresAt,
          lastActiveAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(authSessions.id, input.id),
            eq(authSessions.userId, input.userId),
            eq(authSessions.refreshTokenHash, input.oldHash),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, input.now),
          ),
        )
        .returning()
      return updated
    },
    async revokeValidSession(
      sessionId: string,
      userId: string,
      reason: AuthSessionRevocationReason,
      refreshTokenHash?: string,
    ) {
      const now = new Date()
      const [updated] = await database
        .update(authSessions)
        .set({ revokedAt: now, revocationReason: reason, updatedAt: now })
        .where(
          and(
            eq(authSessions.id, sessionId),
            eq(authSessions.userId, userId),
            refreshTokenHash ? eq(authSessions.refreshTokenHash, refreshTokenHash) : undefined,
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
        .returning()
      return updated
    },
    async updatePasswordAndReplaceSession(input: {
      userId: string
      currentSessionId: string
      credentialHash: string
      passwordHash: string
      newSession: SessionCreateInput
    }) {
      return database.transaction(async (tx) => {
        const now = input.newSession.now
        const [user] = await tx
          .select()
          .from(systemUsers)
          .where(and(eq(systemUsers.id, input.userId), isNull(systemUsers.deletedAt)))
          .limit(1)
          .for('update')
        if (!user || user.status !== USER_STATUS_ENABLED) return undefined
        const [credential] = await tx
          .select()
          .from(authPasswordCredentials)
          .where(eq(authPasswordCredentials.userId, input.userId))
          .limit(1)
        if (!credential || credential.passwordHash !== input.credentialHash) return undefined
        const [current] = await tx
          .update(authSessions)
          .set({ revokedAt: now, revocationReason: 'password_changed', updatedAt: now })
          .where(
            and(
              eq(authSessions.id, input.currentSessionId),
              eq(authSessions.userId, input.userId),
              isNull(authSessions.revokedAt),
              gt(authSessions.expiresAt, now),
            ),
          )
          .returning()
        if (!current) return undefined
        const [updatedCredential] = await tx
          .update(authPasswordCredentials)
          .set({ passwordHash: input.passwordHash, mustChangePassword: false, updatedAt: now })
          .where(eq(authPasswordCredentials.userId, input.userId))
          .returning()
        if (!updatedCredential) return undefined
        await tx
          .update(authSessions)
          .set({ revokedAt: now, revocationReason: 'password_changed', updatedAt: now })
          .where(
            and(
              eq(authSessions.userId, input.userId),
              isNull(authSessions.revokedAt),
              gt(authSessions.expiresAt, now),
            ),
          )
        await tx.insert(authSessions).values(sessionValues(input.newSession))
        return user
      })
    },
  }
}
