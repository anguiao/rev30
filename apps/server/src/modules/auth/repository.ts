import { randomUUID } from 'node:crypto'
import type { AuthProfileUpdateInput } from '@rev30/contracts'
import { and, eq, gt, isNull, lte, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../../db'
import {
  authLoginAttemptBuckets,
  authPasswordCredentials,
  authRefreshTokens,
  systemUsers,
} from '../../db/schema'
import { findDepartmentSummariesByUserId } from '../system/departments/repository'
import { findRoleSummariesByUserId } from '../system/roles/repository'

type RecordLoginFailureInput = {
  username: string
  now: Date
  maxAttempts: number
  windowSeconds: number
  lockSeconds: number
}

export function createAuthRepository(database: Db) {
  return {
    async findActiveUserCredentialByUsername(username: string) {
      const rows = await database
        .select({
          user: systemUsers,
          credential: authPasswordCredentials,
        })
        .from(systemUsers)
        .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, systemUsers.id))
        .where(and(eq(systemUsers.username, username), isNull(systemUsers.deletedAt)))
        .limit(1)

      const account = rows[0]

      if (!account) {
        return undefined
      }

      return {
        ...account,
        departments: await findDepartmentSummariesByUserId(database, account.user.id),
        roles: await findRoleSummariesByUserId(database, account.user.id),
      }
    },

    async findActiveUserById(id: string) {
      const rows = await database
        .select()
        .from(systemUsers)
        .where(and(eq(systemUsers.id, id), isNull(systemUsers.deletedAt)))
        .limit(1)

      const user = rows[0]

      if (!user) {
        return undefined
      }

      return {
        user,
        departments: await findDepartmentSummariesByUserId(database, user.id),
        roles: await findRoleSummariesByUserId(database, user.id),
      }
    },

    async updateUserProfile(userId: string, input: AuthProfileUpdateInput) {
      return await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(systemUsers)
          .set({
            nickname: input.nickname,
            email: input.email,
            phone: input.phone,
          })
          .where(and(eq(systemUsers.id, userId), isNull(systemUsers.deletedAt)))
          .returning()

        if (!updated) {
          return undefined
        }

        return {
          user: updated,
          departments: await findDepartmentSummariesByUserId(tx, updated.id),
          roles: await findRoleSummariesByUserId(tx, updated.id),
        }
      })
    },

    async findActiveUserCredentialById(userId: string) {
      const rows = await database
        .select({
          user: systemUsers,
          credential: authPasswordCredentials,
        })
        .from(systemUsers)
        .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, systemUsers.id))
        .where(and(eq(systemUsers.id, userId), isNull(systemUsers.deletedAt)))
        .limit(1)

      const account = rows[0]

      if (!account) {
        return undefined
      }

      return {
        ...account,
        departments: await findDepartmentSummariesByUserId(database, account.user.id),
        roles: await findRoleSummariesByUserId(database, account.user.id),
      }
    },

    async findLoginAttemptBucketByUsername(username: string) {
      const rows = await database
        .select()
        .from(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, username))
        .limit(1)

      return rows[0]
    },

    async recordLoginFailure(input: RecordLoginFailureInput) {
      const windowCutoff = new Date(input.now.getTime() - input.windowSeconds * 1000)
      const lockUntil = new Date(input.now.getTime() + input.lockSeconds * 1000)
      const activeLockSql = sql`(
        ${authLoginAttemptBuckets.lockedUntil} is not null
        and ${authLoginAttemptBuckets.lockedUntil} > ${input.now}
      )`
      const shouldResetSql = sql`(
        (
          ${authLoginAttemptBuckets.windowStartedAt} <= ${windowCutoff}
          and not ${activeLockSql}
        )
        or (
          ${authLoginAttemptBuckets.lockedUntil} is not null
          and ${authLoginAttemptBuckets.lockedUntil} <= ${input.now}
        )
      )`
      const nextFailedCountSql = sql<number>`case
        when ${activeLockSql} then ${authLoginAttemptBuckets.failedCount}
        when ${shouldResetSql} then 1
        else ${authLoginAttemptBuckets.failedCount} + 1
      end`

      const rows = await database
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
            failedCount: nextFailedCountSql,
            windowStartedAt: sql<Date>`case
              when ${activeLockSql} then ${authLoginAttemptBuckets.windowStartedAt}
              when ${shouldResetSql} then ${input.now}
              else ${authLoginAttemptBuckets.windowStartedAt}
            end`,
            lastFailedAt: input.now,
            lockedUntil: sql<Date | null>`case
              when ${activeLockSql} then ${authLoginAttemptBuckets.lockedUntil}
              when ${nextFailedCountSql} >= ${input.maxAttempts} then ${lockUntil}::timestamptz
              else null::timestamptz
            end`,
            updatedAt: input.now,
          },
        })
        .returning()

      return rows[0]
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

    async updatePasswordCredentialAndRevokeSessions(
      userId: string,
      passwordHash: string,
      currentTokenHash: string | undefined,
    ) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const [credential] = await tx
          .update(authPasswordCredentials)
          .set({
            passwordHash,
            mustChangePassword: false,
          })
          .where(eq(authPasswordCredentials.userId, userId))
          .returning()

        if (!credential) {
          return undefined
        }

        await tx
          .update(authRefreshTokens)
          .set({
            revokedAt: now,
          })
          .where(
            and(
              eq(authRefreshTokens.userId, userId),
              isNull(authRefreshTokens.revokedAt),
              currentTokenHash ? ne(authRefreshTokens.tokenHash, currentTokenHash) : undefined,
            ),
          )

        return credential
      })
    },

    async createRefreshSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
      const [created] = await database
        .insert(authRefreshTokens)
        .values({
          id: randomUUID(),
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        .returning()

      if (!created) {
        throw new Error('创建刷新会话失败')
      }

      return created
    },

    async consumeRefreshSession(tokenHash: string) {
      const now = new Date()
      const [session] = await database
        .update(authRefreshTokens)
        .set({
          revokedAt: now,
        })
        .where(
          and(
            eq(authRefreshTokens.tokenHash, tokenHash),
            isNull(authRefreshTokens.revokedAt),
            gt(authRefreshTokens.expiresAt, now),
          ),
        )
        .returning()

      return session
    },

    async revokeRefreshSession(tokenHash: string) {
      const now = new Date()
      const [session] = await database
        .update(authRefreshTokens)
        .set({
          revokedAt: now,
        })
        .where(and(eq(authRefreshTokens.tokenHash, tokenHash), isNull(authRefreshTokens.revokedAt)))
        .returning()

      return session
    },
  }
}
