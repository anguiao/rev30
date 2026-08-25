import type { OnlineSessionListQuery } from '@rev30/contracts'
import { and, count, desc, eq, gt, ilike, isNull } from 'drizzle-orm'
import type { Db } from '../../../db'
import { authSessions, systemUsers } from '../../../db/schema'

export function createOnlineSessionRepository(database: Db) {
  return {
    async list(query: OnlineSessionListQuery, now: Date) {
      const { page, pageSize, username, createdIp } = query
      const where = and(
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        isNull(systemUsers.deletedAt),
        username ? ilike(systemUsers.username, `%${username}%`) : undefined,
        createdIp ? eq(authSessions.createdIp, createdIp) : undefined,
      )
      const baseSelection = {
        id: authSessions.id,
        userId: systemUsers.id,
        username: systemUsers.username,
        nickname: systemUsers.nickname,
        createdIp: authSessions.createdIp,
        createdIpSource: authSessions.createdIpSource,
        userAgent: authSessions.userAgent,
        createdAt: authSessions.createdAt,
        lastActiveAt: authSessions.lastActiveAt,
        expiresAt: authSessions.expiresAt,
      }
      const [list, totalRows] = await Promise.all([
        database
          .select(baseSelection)
          .from(authSessions)
          .innerJoin(systemUsers, eq(authSessions.userId, systemUsers.id))
          .where(where)
          .orderBy(
            desc(authSessions.lastActiveAt),
            desc(authSessions.createdAt),
            desc(authSessions.id),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database
          .select({ total: count() })
          .from(authSessions)
          .innerJoin(systemUsers, eq(authSessions.userId, systemUsers.id))
          .where(where),
      ])

      return { list, total: totalRows[0]?.total ?? 0, page, pageSize }
    },

    async revoke(id: string, now: Date) {
      const [revoked] = await database
        .update(authSessions)
        .set({
          revokedAt: now,
          revocationReason: 'admin_forced',
          updatedAt: now,
        })
        .where(
          and(
            eq(authSessions.id, id),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
        .returning({ id: authSessions.id })

      return revoked
    },
  }
}
