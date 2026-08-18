import { asc, inArray, sql } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import {
  authSessions,
  opsLoginLogs,
  systemResources,
  systemRoleResources,
  systemUsers,
} from '../../src/db/schema'
import { dbTest } from '../fixtures/database'

describe('stable auth session migration', () => {
  dbTest(
    'creates session and login-log tables and seeds enabled ops resources without bindings',
    async ({ db }) => {
      await expect(db.select().from(authSessions)).resolves.toEqual([])
      await expect(db.select().from(opsLoginLogs)).resolves.toEqual([])
      const legacyTable = await db.execute<{ tableName: string | null }>(
        sql`select to_regclass('auth_refresh_tokens')::text as "tableName"`,
      )
      expect(legacyTable.rows).toEqual([{ tableName: null }])
      const idDefaults = await db.execute<{
        tableName: string
        columnDefault: string | null
      }>(sql`
        select table_name as "tableName", column_default as "columnDefault"
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('auth_sessions', 'ops_login_logs')
          and column_name = 'id'
        order by table_name
      `)
      expect(idDefaults.rows).toEqual([
        { tableName: 'auth_sessions', columnDefault: null },
        { tableName: 'ops_login_logs', columnDefault: 'uuidv7()' },
      ])

      const ids = [
        '10000000-0000-4000-8000-000000000300',
        '10000000-0000-4000-8000-000000000301',
        '10000000-0000-4000-8000-000000000302',
        '10000000-0000-4000-8000-000000000310',
        '10000000-0000-4000-8000-000000000311',
        '10000000-0000-4000-8000-000000000312',
      ]
      const resources = await db
        .select({
          id: systemResources.id,
          code: systemResources.code,
          status: systemResources.status,
        })
        .from(systemResources)
        .where(inArray(systemResources.id, ids))
        .orderBy(asc(systemResources.id))
      expect(resources).toEqual([
        { id: ids[0], code: 'ops', status: 1 },
        { id: ids[1], code: 'ops:login-log', status: 1 },
        { id: ids[2], code: 'ops:login-log:list', status: 1 },
        { id: ids[3], code: 'ops:online-session', status: 1 },
        { id: ids[4], code: 'ops:online-session:list', status: 1 },
        { id: ids[5], code: 'ops:online-session:revoke', status: 1 },
      ])
      await expect(
        db
          .select()
          .from(systemRoleResources)
          .where(inArray(systemRoleResources.resourceId, ids.slice(1))),
      ).resolves.toEqual([])
    },
  )

  dbTest('enforces paired session revocation fields and login result fields', async ({ db }) => {
    const [user] = await db
      .insert(systemUsers)
      .values({ username: 'constraint-user', nickname: 'Constraint User' })
      .returning()

    await expect(
      db.insert(authSessions).values({
        id: '11111111-1111-4111-8111-111111111111',
        userId: user!.id,
        refreshTokenHash: 'invalid-revocation',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        revokedAt: new Date(),
      }),
    ).rejects.toThrow()
    await expect(
      db.insert(opsLoginLogs).values({
        username: 'constraint-user',
        result: 'failure',
        requestId: '6afde8ac-04ec-4dc3-abcf-7bba62f89886',
        clientIpSource: 'unavailable',
      }),
    ).rejects.toThrow()
  })
})
