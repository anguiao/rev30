import { randomUUID } from 'node:crypto'
import { USER_STATUS_ENABLED, type AuthRegisterInput } from '@rev30/shared'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '../../db'
import { authPasswordCredentials, authRefreshTokens, users } from '../../db/schema'

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
          throw new Error('Failed to create user')
        }

        await tx.insert(authPasswordCredentials).values({
          userId: created.id,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        })

        return created
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

      return rows[0]
    },

    async findActiveUserById(id: string) {
      const rows = await database
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1)

      return rows[0]
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
        throw new Error('Failed to create refresh session')
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
