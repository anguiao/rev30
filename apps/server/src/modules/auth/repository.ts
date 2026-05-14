import { randomUUID } from 'node:crypto'
import type { AuthProfileUpdateInput } from '@rev30/shared'
import { and, eq, gt, isNull, ne } from 'drizzle-orm'
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

      return await database.transaction(async (tx) => {
        const [bucket] = await tx
          .select()
          .from(authLoginAttemptBuckets)
          .where(eq(authLoginAttemptBuckets.username, input.username))
          .limit(1)
          .for('update')

        const shouldReset =
          !bucket ||
          bucket.windowStartedAt <= windowCutoff ||
          (bucket.lockedUntil !== null && bucket.lockedUntil <= input.now)
        const failedCount = shouldReset ? 1 : bucket.failedCount + 1
        const lockedUntil =
          failedCount >= input.maxAttempts
            ? new Date(input.now.getTime() + input.lockSeconds * 1000)
            : null

        if (!bucket) {
          const [created] = await tx
            .insert(authLoginAttemptBuckets)
            .values({
              username: input.username,
              failedCount,
              windowStartedAt: input.now,
              lastFailedAt: input.now,
              lockedUntil,
            })
            .returning()

          return created
        }

        const [updated] = await tx
          .update(authLoginAttemptBuckets)
          .set({
            failedCount,
            windowStartedAt: shouldReset ? input.now : bucket.windowStartedAt,
            lastFailedAt: input.now,
            lockedUntil,
          })
          .where(eq(authLoginAttemptBuckets.username, input.username))
          .returning()

        return updated
      })
    },

    async clearLoginAttemptBucket(username: string) {
      await database
        .delete(authLoginAttemptBuckets)
        .where(eq(authLoginAttemptBuckets.username, username))
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
