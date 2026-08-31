import type { Logger } from 'pino'
import {
  cleanupExpiredAttachmentUploadSessions,
  cleanupOrphanedAttachmentUploads,
  cleanupUnreferencedAttachments,
  AttachmentCleanupStorageError,
} from '../../attachments/cleanup'
import type { AttachmentCleanupContext } from '../../attachments/cleanup'
import type { AttachmentStorage } from '../../attachments/storage'
import { cleanupAuthLoginAttemptBuckets, cleanupAuthSessions } from '../../auth/cleanup'
import { cleanupLoginLogs } from '../login-logs/cleanup'
import { cleanupOperationLogs } from '../operation-logs/cleanup'
import { cleanupScheduledJobRuns } from './cleanup'
import type { ScheduledJobRetentionConfig } from './config'
import { ScheduledJobExecutionError } from './errors'
import {
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_AUTH_LOGIN_ATTEMPT_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_AUTH_SESSION_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_OPS_JOB_RUN_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_OPS_LOGIN_LOG_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_OPS_OPERATION_LOG_CLEANUP,
  createScheduledJobRegistry,
  type ScheduledJobDefinition,
  type ScheduledJobRegistry,
} from './registry'

export type ProductionScheduledJobRegistryOptions = {
  database: Parameters<typeof cleanupAuthSessions>[0]
  storage: AttachmentStorage
  retention: ScheduledJobRetentionConfig
}

function assertNotAborted(signal: AbortSignal) {
  signal.throwIfAborted()
}

function mapDatabaseError(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) signal.throwIfAborted()
  throw new ScheduledJobExecutionError('database', error)
}

function mapAttachmentError(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) signal.throwIfAborted()
  if (error instanceof ScheduledJobExecutionError) throw error
  if (error instanceof AttachmentCleanupStorageError) {
    throw new ScheduledJobExecutionError('storage', error.cause)
  }
  throw new ScheduledJobExecutionError('database', error)
}

async function runDatabaseCleanup(
  signal: AbortSignal,
  cleanup: () => Promise<number | { deletedCount: number; failedCount: number }>,
) {
  assertNotAborted(signal)
  let result
  try {
    result = await cleanup()
  } catch (error) {
    mapDatabaseError(error, signal)
  }
  assertNotAborted(signal)
  return typeof result === 'number'
    ? { deletedCount: result, failedCount: 0 }
    : { deletedCount: result.deletedCount, failedCount: result.failedCount }
}

async function runAttachmentCleanup(
  signal: AbortSignal,
  cleanup: () => Promise<{ deletedCount: number; failedCount: number }>,
) {
  assertNotAborted(signal)
  let result
  try {
    result = await cleanup()
  } catch (error) {
    mapAttachmentError(error, signal)
  }
  assertNotAborted(signal)
  return result
}

function createAttachmentContext(signal: AbortSignal, logger: Logger): AttachmentCleanupContext {
  return { signal, logger }
}

export function createProductionScheduledJobRegistry(
  options: ProductionScheduledJobRegistryOptions,
): ScheduledJobRegistry {
  const { database, storage, retention } = options
  const definitions: ScheduledJobDefinition[] = [
    {
      key: SCHEDULED_JOB_TASK_KEY_AUTH_SESSION_CLEANUP,
      name: '认证会话清理',
      description: '清理自然到期会话及超过保留期的已撤销会话',
      run: async ({ signal }) =>
        await runDatabaseCleanup(signal, () =>
          cleanupAuthSessions(database, retention.revokedSessionRetentionMs),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_AUTH_LOGIN_ATTEMPT_CLEANUP,
      name: '登录尝试桶清理',
      description: '清理超过保留期的登录限流桶',
      run: async ({ signal }) =>
        await runDatabaseCleanup(signal, () =>
          cleanupAuthLoginAttemptBuckets(database, retention.loginAttemptRetentionMs),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_OPS_LOGIN_LOG_CLEANUP,
      name: '登录日志清理',
      description: '清理超过保留期的登录日志',
      run: async ({ signal }) =>
        await runDatabaseCleanup(signal, () =>
          cleanupLoginLogs(database, retention.loginLogRetentionMs),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_OPS_OPERATION_LOG_CLEANUP,
      name: '操作日志清理',
      description: '清理超过保留期的操作日志',
      run: async ({ signal }) =>
        await runDatabaseCleanup(signal, () =>
          cleanupOperationLogs(database, retention.operationLogRetentionMs),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP,
      name: '过期附件上传会话清理',
      description: '删除过期上传会话及其临时存储对象',
      run: async ({ signal, logger }) => {
        return await runAttachmentCleanup(signal, () =>
          cleanupExpiredAttachmentUploadSessions(
            database,
            storage,
            createAttachmentContext(signal, logger),
          ),
        )
      },
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP,
      name: '未引用附件清理',
      description: '软删除超过保留期且没有引用的附件并清理存储对象',
      run: async ({ signal, logger }) => {
        return await runAttachmentCleanup(signal, () =>
          cleanupUnreferencedAttachments(
            database,
            storage,
            retention.attachmentRetentionMs,
            createAttachmentContext(signal, logger),
          ),
        )
      },
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP,
      name: '孤立附件存储清理',
      description: '清理不再受活动附件或上传会话保护的过期存储对象',
      run: async ({ signal, logger }) => {
        return await runAttachmentCleanup(signal, () =>
          cleanupOrphanedAttachmentUploads(
            database,
            storage,
            retention.attachmentRetentionMs,
            createAttachmentContext(signal, logger),
          ),
        )
      },
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_OPS_JOB_RUN_CLEANUP,
      name: '任务运行日志清理',
      description: '清理超过保留期且未被活动运行引用的终态任务运行记录',
      run: async ({ signal }) =>
        await runDatabaseCleanup(signal, () =>
          cleanupScheduledJobRuns(database, retention.jobRunRetentionMs).then(
            ({ deletedCount, failedCount }) => ({ deletedCount, failedCount }),
          ),
        ),
    },
  ]

  return createScheduledJobRegistry(definitions)
}
