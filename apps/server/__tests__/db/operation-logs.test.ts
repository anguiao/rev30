import { asc, inArray, sql } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import { opsOperationLogs, systemResources, systemRoleResources } from '../../src/db/schema'
import { dbTest, type TestDatabase } from '../fixtures/database'

const resourceIds = ['10000000-0000-4000-8000-000000000320', '10000000-0000-4000-8000-000000000321']

function validOperationLog(overrides: Partial<typeof opsOperationLogs.$inferInsert> = {}) {
  return {
    actorUserId: '10000000-0000-4000-8000-000000000001',
    actorUsername: 'ada',
    actorNickname: 'Ada Lovelace',
    actorIsAdmin: false,
    actorSessionId: '10000000-0000-4000-8000-000000000002',
    module: 'system',
    action: 'system:user:update',
    targetType: 'user',
    targetKey: '10000000-0000-4000-8000-000000000001',
    targetLabel: null,
    result: 'success',
    httpStatus: 200,
    durationMs: 12,
    requestId: '10000000-0000-4000-8000-000000000003',
    clientIp: '192.0.2.1',
    clientIpSource: 'socket',
    userAgent: 'Example/1.0',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    ...overrides,
  } satisfies typeof opsOperationLogs.$inferInsert
}

async function expectInsertRejected(
  db: TestDatabase,
  overrides: Partial<typeof opsOperationLogs.$inferInsert>,
  constraint: string,
) {
  await db.execute(sql`savepoint operation_log_constraint_check`)

  try {
    await expect(
      db.insert(opsOperationLogs).values(
        validOperationLog({
          requestId: crypto.randomUUID(),
          ...overrides,
        }),
      ),
    ).rejects.toMatchObject({ cause: { constraint } })
  } finally {
    await db.execute(sql`rollback to savepoint operation_log_constraint_check`)
  }
}

describe('operation log migration', () => {
  dbTest('creates the empty table with defaults, columns, checks and indexes', async ({ db }) => {
    await expect(db.select().from(opsOperationLogs)).resolves.toEqual([])

    const columns = await db.execute<{
      columnName: string
      dataType: string
      nullable: string
      columnDefault: string | null
    }>(sql`
      select
        column_name as "columnName",
        data_type as "dataType",
        is_nullable as "nullable",
        column_default as "columnDefault"
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ops_operation_logs'
      order by ordinal_position
    `)
    expect(columns.rows).toEqual([
      { columnName: 'id', dataType: 'uuid', nullable: 'NO', columnDefault: 'uuidv7()' },
      { columnName: 'actor_user_id', dataType: 'uuid', nullable: 'NO', columnDefault: null },
      { columnName: 'actor_username', dataType: 'text', nullable: 'NO', columnDefault: null },
      { columnName: 'actor_nickname', dataType: 'text', nullable: 'NO', columnDefault: null },
      { columnName: 'actor_is_admin', dataType: 'boolean', nullable: 'NO', columnDefault: null },
      { columnName: 'actor_session_id', dataType: 'uuid', nullable: 'NO', columnDefault: null },
      { columnName: 'module', dataType: 'text', nullable: 'NO', columnDefault: null },
      { columnName: 'action', dataType: 'text', nullable: 'NO', columnDefault: null },
      { columnName: 'target_type', dataType: 'text', nullable: 'NO', columnDefault: null },
      { columnName: 'target_key', dataType: 'text', nullable: 'YES', columnDefault: null },
      { columnName: 'target_label', dataType: 'text', nullable: 'YES', columnDefault: null },
      { columnName: 'result', dataType: 'text', nullable: 'NO', columnDefault: null },
      { columnName: 'http_status', dataType: 'smallint', nullable: 'NO', columnDefault: null },
      { columnName: 'duration_ms', dataType: 'integer', nullable: 'NO', columnDefault: null },
      { columnName: 'request_id', dataType: 'uuid', nullable: 'NO', columnDefault: null },
      { columnName: 'client_ip', dataType: 'text', nullable: 'YES', columnDefault: null },
      { columnName: 'client_ip_source', dataType: 'text', nullable: 'NO', columnDefault: null },
      { columnName: 'user_agent', dataType: 'text', nullable: 'YES', columnDefault: null },
      {
        columnName: 'created_at',
        dataType: 'timestamp with time zone',
        nullable: 'NO',
        columnDefault: 'now()',
      },
    ])

    const constraints = await db.execute<{ name: string }>(sql`
      select conname as name
      from pg_constraint
      where conrelid = 'ops_operation_logs'::regclass and contype = 'c'
      order by conname
    `)
    expect(constraints.rows.map(({ name }) => name)).toEqual([
      'ops_operation_logs_action_shape_check',
      'ops_operation_logs_actor_snapshot_check',
      'ops_operation_logs_client_ip_source_check',
      'ops_operation_logs_duration_check',
      'ops_operation_logs_http_status_check',
      'ops_operation_logs_module_check',
      'ops_operation_logs_result_status_check',
      'ops_operation_logs_target_check',
      'ops_operation_logs_user_agent_length_check',
    ])

    const foreignKeys = await db.execute<{ count: number }>(sql`
      select count(*)::integer as count
      from pg_constraint
      where conrelid = 'ops_operation_logs'::regclass and contype = 'f'
    `)
    expect(foreignKeys.rows).toEqual([{ count: 0 }])

    const indexes = await db.execute<{ name: string }>(sql`
      select indexname as name
      from pg_indexes
      where schemaname = 'public' and tablename = 'ops_operation_logs'
      order by indexname
    `)
    expect(indexes.rows.map(({ name }) => name)).toEqual([
      'ops_operation_logs_actor_session_id_idx',
      'ops_operation_logs_actor_user_id_idx',
      'ops_operation_logs_client_ip_idx',
      'ops_operation_logs_created_at_id_idx',
      'ops_operation_logs_http_status_idx',
      'ops_operation_logs_module_action_idx',
      'ops_operation_logs_pkey',
      'ops_operation_logs_request_id_unique',
      'ops_operation_logs_result_idx',
      'ops_operation_logs_target_type_target_key_idx',
    ])
  })

  dbTest('seeds enabled operation-log resources without role bindings', async ({ db }) => {
    const resources = await db
      .select({
        id: systemResources.id,
        parentId: systemResources.parentId,
        type: systemResources.type,
        name: systemResources.name,
        code: systemResources.code,
        path: systemResources.path,
        icon: systemResources.icon,
        status: systemResources.status,
        sortOrder: systemResources.sortOrder,
      })
      .from(systemResources)
      .where(inArray(systemResources.id, resourceIds))
      .orderBy(asc(systemResources.id))

    expect(resources).toEqual([
      {
        id: resourceIds[0],
        parentId: '10000000-0000-4000-8000-000000000300',
        type: 'menu',
        name: '操作日志',
        code: 'ops:operation-log',
        path: '/ops/operation-logs',
        icon: 'lucide:scroll-text',
        status: 1,
        sortOrder: 30,
      },
      {
        id: resourceIds[1],
        parentId: resourceIds[0],
        type: 'action',
        name: '查看操作日志',
        code: 'ops:operation-log:list',
        path: null,
        icon: null,
        status: 1,
        sortOrder: 10,
      },
    ])
    await expect(
      db
        .select()
        .from(systemRoleResources)
        .where(inArray(systemRoleResources.resourceId, resourceIds)),
    ).resolves.toEqual([])
  })

  dbTest('enforces request uniqueness and operation-log checks', async ({ db }) => {
    await db.insert(opsOperationLogs).values(validOperationLog())

    const invalidRows = [
      [
        { requestId: '10000000-0000-4000-8000-000000000003', targetKey: 'another-user' },
        'ops_operation_logs_request_id_unique',
      ],
      [{ result: 'failure', httpStatus: 200 }, 'ops_operation_logs_result_status_check'],
      [{ result: 'success', httpStatus: 400 }, 'ops_operation_logs_result_status_check'],
      [{ module: 'auth', action: 'auth:user:update' }, 'ops_operation_logs_module_check'],
      [{ clientIpSource: 'header' }, 'ops_operation_logs_client_ip_source_check'],
      [{ durationMs: -1 }, 'ops_operation_logs_duration_check'],
      [{ httpStatus: 99, result: 'failure' }, 'ops_operation_logs_http_status_check'],
      [{ action: 'content:user:update' }, 'ops_operation_logs_action_shape_check'],
      [{ targetType: 'role' }, 'ops_operation_logs_action_shape_check'],
      [{ action: 'system:user:   ' }, 'ops_operation_logs_action_shape_check'],
      [{ action: 'system:user:update:extra' }, 'ops_operation_logs_action_shape_check'],
      [{ actorUsername: ' ' }, 'ops_operation_logs_actor_snapshot_check'],
      [{ actorNickname: 'a'.repeat(513) }, 'ops_operation_logs_actor_snapshot_check'],
      [{ targetKey: null, targetLabel: null }, 'ops_operation_logs_target_check'],
      [{ targetKey: ' ', targetLabel: null }, 'ops_operation_logs_target_check'],
      [{ targetKey: 'a'.repeat(513), targetLabel: null }, 'ops_operation_logs_target_check'],
      [{ userAgent: 'a'.repeat(513) }, 'ops_operation_logs_user_agent_length_check'],
    ] as const

    for (const [overrides, constraint] of invalidRows) {
      await expectInsertRejected(db, overrides, constraint)
    }
  })
})
