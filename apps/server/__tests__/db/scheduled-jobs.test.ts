import {
  SCHEDULED_JOB_ERROR_CATEGORY_DATABASE,
  SCHEDULED_JOB_RUN_STATUS_FAILURE,
  SCHEDULED_JOB_RUN_STATUS_RUNNING,
  SCHEDULED_JOB_RUN_STATUS_SKIPPED,
  SCHEDULED_JOB_RUN_STATUS_SUCCESS,
  SCHEDULED_JOB_SKIP_REASON_OVERLAP,
} from '@rev30/contracts'
import { getNextCronOccurrences, parseCronSchedule } from '@rev30/utils'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { describe, expect } from 'vitest'
import {
  opsJobRuns,
  opsScheduledJobs,
  systemResources,
  systemRoleResources,
} from '../../src/db/schema'
import {
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP,
  scheduledJobTaskKeys,
} from '../../src/modules/ops/scheduled-jobs/registry'
import { dbTest, type TestDatabase } from '../fixtures/database'

const taskKeys = scheduledJobTaskKeys

const resourceIds = [
  '10000000-0000-4000-8000-000000000322',
  '10000000-0000-4000-8000-000000000323',
  '10000000-0000-4000-8000-000000000324',
  '10000000-0000-4000-8000-000000000325',
  '10000000-0000-4000-8000-000000000326',
]

const validTaskKey = taskKeys[0]
const validRunId = '20000000-0000-4000-8000-000000000001'
const secondRunId = '20000000-0000-4000-8000-000000000002'
const validExecutorId = '30000000-0000-4000-8000-000000000001'
const validUserId = '40000000-0000-4000-8000-000000000001'
const validSessionId = '50000000-0000-4000-8000-000000000001'
const validRequestId = '60000000-0000-4000-8000-000000000001'
const validCancelRequestId = '70000000-0000-4000-8000-000000000001'
const startedAt = new Date('2026-08-25T00:00:00.000Z')
const finishedAt = new Date('2026-08-25T00:00:01.000Z')

function validRunningRun(
  overrides: Partial<typeof opsJobRuns.$inferInsert> = {},
): typeof opsJobRuns.$inferInsert {
  return {
    id: validRunId,
    taskKey: validTaskKey,
    triggerSource: 'scheduled',
    status: SCHEDULED_JOB_RUN_STATUS_RUNNING,
    scheduledFor: startedAt,
    executorId: validExecutorId,
    startedAt,
    ...overrides,
  }
}

function validManualRunningRun(
  overrides: Partial<typeof opsJobRuns.$inferInsert> = {},
): typeof opsJobRuns.$inferInsert {
  return validRunningRun({
    id: secondRunId,
    triggerSource: 'manual',
    scheduledFor: null,
    triggeredByUserId: validUserId,
    triggeredByUsername: 'operator',
    triggeredByNickname: 'Operator',
    triggeredBySessionId: validSessionId,
    triggerRequestId: validRequestId,
    ...overrides,
  })
}

async function expectRejected(db: TestDatabase, values: typeof opsJobRuns.$inferInsert) {
  await db.execute(sql`savepoint scheduled_job_constraint_check`)
  try {
    await expect(db.insert(opsJobRuns).values(values)).rejects.toThrow()
  } finally {
    await db.execute(sql`rollback to savepoint scheduled_job_constraint_check`)
  }
}

async function expectJobRejected(db: TestDatabase, values: typeof opsScheduledJobs.$inferInsert) {
  await db.execute(sql`savepoint scheduled_job_plan_check`)
  try {
    await expect(db.insert(opsScheduledJobs).values(values)).rejects.toThrow()
  } finally {
    await db.execute(sql`rollback to savepoint scheduled_job_plan_check`)
  }
}

async function expectActiveRunUpdateRejected(
  db: TestDatabase,
  taskKey: string,
  activeRunId: string,
) {
  await db.execute(sql`savepoint scheduled_job_active_run_check`)
  try {
    await expect(
      db.update(opsScheduledJobs).set({ activeRunId }).where(eq(opsScheduledJobs.taskKey, taskKey)),
    ).rejects.toThrow()
  } finally {
    await db.execute(sql`rollback to savepoint scheduled_job_active_run_check`)
  }
}

describe('scheduled jobs migration', () => {
  dbTest(
    'creates both tables with required columns, types, defaults, checks, and indexes',
    async ({ db }) => {
      const columns = await db.execute<{
        tableName: string
        columnName: string
        dataType: string
        nullable: string
        columnDefault: string | null
      }>(sql`
      select
        table_name as "tableName",
        column_name as "columnName",
        data_type as "dataType",
        is_nullable as "nullable",
        column_default as "columnDefault"
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('ops_scheduled_jobs', 'ops_job_runs')
      order by table_name, ordinal_position
    `)

      expect(columns.rows).toEqual([
        {
          tableName: 'ops_job_runs',
          columnName: 'id',
          dataType: 'uuid',
          nullable: 'NO',
          columnDefault: 'uuidv7()',
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'task_key',
          dataType: 'text',
          nullable: 'NO',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'trigger_source',
          dataType: 'text',
          nullable: 'NO',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'status',
          dataType: 'text',
          nullable: 'NO',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'skip_reason',
          dataType: 'text',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'scheduled_for',
          dataType: 'timestamp with time zone',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'executor_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'deleted_count',
          dataType: 'integer',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'failed_count',
          dataType: 'integer',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'error_category',
          dataType: 'text',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'error_summary',
          dataType: 'text',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'triggered_by_user_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'triggered_by_username',
          dataType: 'text',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'triggered_by_nickname',
          dataType: 'text',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'triggered_by_session_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'trigger_request_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'cancel_requested_at',
          dataType: 'timestamp with time zone',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'cancel_requested_by_user_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'cancel_requested_by_username',
          dataType: 'text',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'cancel_requested_by_nickname',
          dataType: 'text',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'cancel_requested_by_session_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'cancel_request_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'started_at',
          dataType: 'timestamp with time zone',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'finished_at',
          dataType: 'timestamp with time zone',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'duration_ms',
          dataType: 'bigint',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'created_at',
          dataType: 'timestamp with time zone',
          nullable: 'NO',
          columnDefault: 'now()',
        },
        {
          tableName: 'ops_job_runs',
          columnName: 'updated_at',
          dataType: 'timestamp with time zone',
          nullable: 'NO',
          columnDefault: 'now()',
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'task_key',
          dataType: 'text',
          nullable: 'NO',
          columnDefault: null,
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'cron_expression',
          dataType: 'text',
          nullable: 'NO',
          columnDefault: null,
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'timezone',
          dataType: 'text',
          nullable: 'NO',
          columnDefault: null,
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'enabled',
          dataType: 'boolean',
          nullable: 'NO',
          columnDefault: 'true',
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'next_run_at',
          dataType: 'timestamp with time zone',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'active_run_id',
          dataType: 'uuid',
          nullable: 'YES',
          columnDefault: null,
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'created_at',
          dataType: 'timestamp with time zone',
          nullable: 'NO',
          columnDefault: 'now()',
        },
        {
          tableName: 'ops_scheduled_jobs',
          columnName: 'updated_at',
          dataType: 'timestamp with time zone',
          nullable: 'NO',
          columnDefault: 'now()',
        },
      ])

      const indexes = await db.execute<{ tableName: string; name: string }>(sql`
      select tablename as "tableName", indexname as name
      from pg_indexes
      where schemaname = 'public'
        and tablename in ('ops_scheduled_jobs', 'ops_job_runs')
      order by tablename, indexname
    `)
      expect(indexes.rows.map(({ tableName, name }) => `${tableName}:${name}`)).toEqual([
        'ops_job_runs:ops_job_runs_finished_at_id_idx',
        'ops_job_runs:ops_job_runs_pkey',
        'ops_job_runs:ops_job_runs_status_idx',
        'ops_job_runs:ops_job_runs_task_key_created_at_id_idx',
        'ops_job_runs:ops_job_runs_task_key_running_unique',
        'ops_job_runs:ops_job_runs_trigger_request_id_unique',
        'ops_scheduled_jobs:ops_scheduled_jobs_active_run_id_unique',
        'ops_scheduled_jobs:ops_scheduled_jobs_enabled_next_run_at_task_key_idx',
        'ops_scheduled_jobs:ops_scheduled_jobs_pkey',
      ])

      const foreignKeys = await db.execute<{
        tableName: string
        name: string
        deleteAction: string
      }>(sql`
      select
        cls.relname as "tableName",
        con.conname as name,
        con.confdeltype as "deleteAction"
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      where con.contype = 'f'
        and cls.relname in ('ops_scheduled_jobs', 'ops_job_runs')
      order by cls.relname, con.conname
    `)
      expect(foreignKeys.rows).toHaveLength(2)
      expect(foreignKeys.rows.every(({ deleteAction }) => deleteAction === 'r')).toBe(true)
    },
  )

  dbTest(
    'seeds eight enabled plans with valid six-hour phases and fixed resources without bindings',
    async ({ db }) => {
      const jobs = await db.select().from(opsScheduledJobs).orderBy(asc(opsScheduledJobs.taskKey))

      expect(jobs).toHaveLength(taskKeys.length)
      expect(new Set(jobs.map(({ taskKey }) => taskKey)).size).toBe(taskKeys.length)
      const now = new Date()
      expect(jobs.every((job) => job.enabled && job.timezone === 'Asia/Shanghai')).toBe(true)
      expect(jobs.every(({ nextRunAt }) => nextRunAt !== null && nextRunAt <= now)).toBe(true)

      const from = new Date('2026-08-25T00:00:00.000Z')
      const phaseMinutes = new Set<number>()
      const firstRunByTask = new Map<string, number>()
      for (const job of jobs) {
        const schedule = parseCronSchedule(
          {
            expression: job.cronExpression,
            timezone: job.timezone,
          },
          from,
        )
        const occurrences = getNextCronOccurrences(schedule, from, 3)
        firstRunByTask.set(job.taskKey, occurrences[0]!.getTime())
        const intervals = occurrences
          .slice(1)
          .map((value, index) => value.getTime() - occurrences[index]!.getTime())
        expect(intervals.every((interval) => interval === 6 * 60 * 60 * 1000)).toBe(true)
        const localTime = new Intl.DateTimeFormat('en-CA', {
          timeZone: job.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(occurrences[0])
        phaseMinutes.add(Number(localTime.slice(0, 2)) * 60 + Number(localTime.slice(3)))
      }
      expect(phaseMinutes.size).toBe(taskKeys.length)

      const attachmentOrder = jobs
        .filter(({ taskKey }) => taskKey.startsWith('attachment-'))
        .sort(
          (left, right) =>
            (firstRunByTask.get(left.taskKey) ?? 0) - (firstRunByTask.get(right.taskKey) ?? 0),
        )
        .map(({ taskKey }) => taskKey)
      expect(attachmentOrder).toEqual([
        SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP,
        SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP,
        SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP,
      ])

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
      expect(resources).toHaveLength(resourceIds.length)
      expect(resources[0]).toMatchObject({
        id: resourceIds[0],
        parentId: '10000000-0000-4000-8000-000000000300',
        type: 'menu',
        name: '定时任务',
        code: 'ops:scheduled-job',
        path: '/ops/scheduled-jobs',
        status: 1,
        sortOrder: 40,
      })
      expect(resources.slice(1).map(({ code }) => code)).toEqual([
        'ops:scheduled-job:list',
        'ops:scheduled-job:update',
        'ops:scheduled-job:execute',
        'ops:scheduled-job:cancel',
      ])
      await expect(
        db
          .select()
          .from(systemRoleResources)
          .where(inArray(systemRoleResources.resourceId, resourceIds)),
      ).resolves.toEqual([])
    },
  )

  dbTest('enforces plan/run state shapes and database uniqueness constraints', async ({ db }) => {
    const secondTaskKey = taskKeys[1]
    await expectJobRejected(db, {
      taskKey: `invalid-${crypto.randomUUID()}`,
      cronExpression: '2 * * * *',
      timezone: 'UTC',
      enabled: true,
      nextRunAt: null,
    })
    await expectJobRejected(db, {
      taskKey: `invalid-${crypto.randomUUID()}`,
      cronExpression: '2 * * * *',
      timezone: 'UTC',
      enabled: false,
      nextRunAt: startedAt,
    })
    await db.insert(opsJobRuns).values(validRunningRun())

    await expectRejected(db, validRunningRun({ id: secondRunId }))
    await db.insert(opsJobRuns).values(validManualRunningRun({ taskKey: secondTaskKey }))
    await expectRejected(
      db,
      validManualRunningRun({
        id: '20000000-0000-4000-8000-000000000003',
        taskKey: secondTaskKey,
        status: SCHEDULED_JOB_RUN_STATUS_FAILURE,
        finishedAt,
        durationMs: 1,
        errorCategory: SCHEDULED_JOB_ERROR_CATEGORY_DATABASE,
        errorSummary: 'Database operation failed',
      }),
    )
    await expectRejected(
      db,
      validRunningRun({ id: '20000000-0000-4000-8000-000000000004', taskKey: 'not-a-task' }),
    )
    await expectRejected(
      db,
      validRunningRun({
        id: '20000000-0000-4000-8000-000000000005',
        status: SCHEDULED_JOB_RUN_STATUS_SKIPPED,
        skipReason: SCHEDULED_JOB_SKIP_REASON_OVERLAP,
        executorId: validExecutorId,
      }),
    )
    await expectRejected(
      db,
      validRunningRun({ id: '20000000-0000-4000-8000-000000000006', finishedAt }),
    )
    await expectRejected(
      db,
      validRunningRun({
        id: '20000000-0000-4000-8000-000000000007',
        triggerSource: 'manual',
        scheduledFor: startedAt,
      }),
    )
    await expectRejected(
      db,
      validManualRunningRun({
        id: '20000000-0000-4000-8000-000000000008',
        triggeredByNickname: null,
      }),
    )
    await expectRejected(
      db,
      validRunningRun({
        id: '20000000-0000-4000-8000-000000000009',
        status: SCHEDULED_JOB_RUN_STATUS_SUCCESS,
        finishedAt,
        durationMs: 1,
        failedCount: 1,
      }),
    )
    await expectRejected(
      db,
      validRunningRun({
        id: '20000000-0000-4000-8000-000000000010',
        status: SCHEDULED_JOB_RUN_STATUS_FAILURE,
        finishedAt,
        durationMs: 1,
      }),
    )
    await expectRejected(
      db,
      validRunningRun({
        id: '20000000-0000-4000-8000-000000000011',
        status: SCHEDULED_JOB_RUN_STATUS_SKIPPED,
        skipReason: SCHEDULED_JOB_SKIP_REASON_OVERLAP,
        startedAt,
        executorId: null,
        scheduledFor: startedAt,
        finishedAt,
      }),
    )
    await expectRejected(
      db,
      validRunningRun({
        id: '20000000-0000-4000-8000-000000000012',
        status: SCHEDULED_JOB_RUN_STATUS_FAILURE,
        finishedAt,
        durationMs: 1,
        errorCategory: SCHEDULED_JOB_ERROR_CATEGORY_DATABASE,
        errorSummary: ' ',
      }),
    )

    await expect(
      db
        .update(opsScheduledJobs)
        .set({ activeRunId: validRunId })
        .where(eq(opsScheduledJobs.taskKey, validTaskKey)),
    ).resolves.toBeDefined()
    await expectActiveRunUpdateRejected(db, secondTaskKey, validRunId)
    await expectActiveRunUpdateRejected(db, secondTaskKey, '20000000-0000-4000-8000-000000000999')
  })

  dbTest('accepts valid terminal, skipped, and cancellation snapshot records', async ({ db }) => {
    await db.insert(opsJobRuns).values([
      {
        ...validRunningRun(),
        status: SCHEDULED_JOB_RUN_STATUS_SUCCESS,
        deletedCount: 3,
        failedCount: 0,
        finishedAt,
        durationMs: 1000,
      },
      {
        ...validRunningRun({ id: secondRunId }),
        status: SCHEDULED_JOB_RUN_STATUS_FAILURE,
        finishedAt,
        durationMs: 1000,
        failedCount: 1,
        errorCategory: SCHEDULED_JOB_ERROR_CATEGORY_DATABASE,
        errorSummary: 'Database operation failed',
      },
      {
        ...validRunningRun({ id: '20000000-0000-0000-0000-000000000003' }),
        status: SCHEDULED_JOB_RUN_STATUS_SKIPPED,
        skipReason: SCHEDULED_JOB_SKIP_REASON_OVERLAP,
        scheduledFor: startedAt,
        executorId: null,
        startedAt: null,
        finishedAt,
      },
      {
        ...validManualRunningRun({ id: '20000000-0000-0000-0000-000000000004' }),
        status: 'cancelled',
        finishedAt,
        durationMs: 1000,
        cancelRequestedAt: startedAt,
        cancelRequestedByUserId: validUserId,
        cancelRequestedByUsername: 'operator',
        cancelRequestedByNickname: 'Operator',
        cancelRequestedBySessionId: validSessionId,
        cancelRequestId: validCancelRequestId,
      },
      {
        ...validRunningRun({ id: '20000000-0000-0000-0000-000000000005' }),
        triggerSource: 'recovery',
        scheduledFor: null,
        status: SCHEDULED_JOB_RUN_STATUS_SUCCESS,
        deletedCount: 0,
        failedCount: 0,
        finishedAt,
        durationMs: 1000,
      },
    ])

    await expect(db.select().from(opsJobRuns)).resolves.toHaveLength(5)
  })
})
