import { randomUUID } from 'node:crypto'
import {
  USER_STATUS_ENABLED,
  type AuthProfileUpdateInput,
  type AuthRegisterInput,
} from '@rev30/shared'
import { and, eq, gt, isNull, ne } from 'drizzle-orm'
import type { Db } from '../../db'
import { authPasswordCredentials, authRefreshTokens, users } from '../../db/schema'
import { findDepartmentSummariesByUserId } from '../system/departments/repository'
import { findRoleSummariesByUserId } from '../system/roles/repository'

export function createAuthRepository(database: Db) {
  return {
    async createUser(input: AuthRegisterInput, passwordHash: string) {
      const now = new Date()

      return await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            id: randomUUID(),
            username: input.username,
            nickname: input.nickname,
            email: input.email ?? null,
            phone: input.phone ?? null,
            status: USER_STATUS_ENABLED,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        if (!created) {
          throw new Error('创建用户失败')
        }

        await tx.insert(authPasswordCredentials).values({
          userId: created.id,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        })

        return {
          user: created,
          departments: [],
          roles: [],
        }
      })
    },

    async findActiveUserCredentialByUsername(username: string) {
      const rows = await database
        .select({
          user: users,
          credential: authPasswordCredentials,
        })
        .from(users)
        .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, users.id))
        .where(and(eq(users.username, username), isNull(users.deletedAt)))
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
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
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
      const now = new Date()

      return await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(users)
          .set({
            nickname: input.nickname,
            email: input.email,
            phone: input.phone,
            updatedAt: now,
          })
          .where(and(eq(users.id, userId), isNull(users.deletedAt)))
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
          user: users,
          credential: authPasswordCredentials,
        })
        .from(users)
        .innerJoin(authPasswordCredentials, eq(authPasswordCredentials.userId, users.id))
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
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
            updatedAt: now,
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
            updatedAt: now,
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
      const now = new Date()
      const [created] = await database
        .insert(authRefreshTokens)
        .values({
          id: randomUUID(),
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdAt: now,
          updatedAt: now,
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
          updatedAt: now,
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
          updatedAt: now,
        })
        .where(and(eq(authRefreshTokens.tokenHash, tokenHash), isNull(authRefreshTokens.revokedAt)))
        .returning()

      return session
    },
  }
}
