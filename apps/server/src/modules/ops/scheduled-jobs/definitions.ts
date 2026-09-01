import type { Db } from '../../../db'
import {
  cleanupExpiredAttachmentUploadSessions,
  cleanupOrphanedAttachmentUploads,
  cleanupUnreferencedAttachments,
} from '../../attachments/cleanup'
import { AttachmentStorageListError } from '../../attachments/errors'
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
  type ScheduledJobDefinition,
  type ScheduledJobResult,
} from './registry'

export type ScheduledJobDefinitionsOptions = {
  database: Db
  storage: AttachmentStorage
  retention: ScheduledJobRetentionConfig
}

async function runDatabaseCleanup(
  signal: AbortSignal,
  cleanup: () => Promise<number>,
): Promise<ScheduledJobResult> {
  signal.throwIfAborted()
  let result
  try {
    result = await cleanup()
  } catch (error) {
    signal.throwIfAborted()
    throw new ScheduledJobExecutionError('database', error)
  }
  signal.throwIfAborted()

  return { deletedCount: result, failedCount: 0 }
}

async function runAttachmentCleanup(
  signal: AbortSignal,
  cleanup: () => Promise<ScheduledJobResult>,
): Promise<ScheduledJobResult> {
  try {
    return await cleanup()
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof AttachmentStorageListError) {
      throw new ScheduledJobExecutionError('storage', error.cause)
    }
    throw new ScheduledJobExecutionError('database', error)
  }
}

export function createScheduledJobDefinitions(
  options: ScheduledJobDefinitionsOptions,
): ScheduledJobDefinition[] {
  const { database, storage, retention } = options
  return [
    {
      key: SCHEDULED_JOB_TASK_KEY_AUTH_SESSION_CLEANUP,
      name: '认证会话清理',
      description: '清理自然到期会话及超过保留期的已撤销会话',
      run: ({ signal }) =>
        runDatabaseCleanup(signal, () =>
          cleanupAuthSessions(database, retention.revokedSessionRetentionMs),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_AUTH_LOGIN_ATTEMPT_CLEANUP,
      name: '登录尝试桶清理',
      description: '清理超过保留期的登录限流桶',
      run: ({ signal }) =>
        runDatabaseCleanup(signal, () =>
          cleanupAuthLoginAttemptBuckets(database, retention.loginAttemptRetentionMs),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_OPS_LOGIN_LOG_CLEANUP,
      name: '登录日志清理',
      description: '清理超过保留期的登录日志',
      run: ({ signal }) =>
        runDatabaseCleanup(signal, () => cleanupLoginLogs(database, retention.loginLogRetentionMs)),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_OPS_OPERATION_LOG_CLEANUP,
      name: '操作日志清理',
      description: '清理超过保留期的操作日志',
      run: ({ signal }) =>
        runDatabaseCleanup(signal, () =>
          cleanupOperationLogs(database, retention.operationLogRetentionMs),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP,
      name: '过期附件上传会话清理',
      description: '删除过期上传会话及其临时存储对象',
      run: (context) =>
        runAttachmentCleanup(context.signal, () =>
          cleanupExpiredAttachmentUploadSessions(database, storage, context),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP,
      name: '未引用附件清理',
      description: '软删除超过保留期且没有引用的附件并清理存储对象',
      run: (context) =>
        runAttachmentCleanup(context.signal, () =>
          cleanupUnreferencedAttachments(
            database,
            storage,
            retention.attachmentRetentionMs,
            context,
          ),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP,
      name: '孤立附件存储清理',
      description: '清理不再受活动附件或上传会话保护的过期存储对象',
      run: (context) =>
        runAttachmentCleanup(context.signal, () =>
          cleanupOrphanedAttachmentUploads(
            database,
            storage,
            retention.attachmentRetentionMs,
            context,
          ),
        ),
    },
    {
      key: SCHEDULED_JOB_TASK_KEY_OPS_JOB_RUN_CLEANUP,
      name: '任务运行日志清理',
      description: '清理超过保留期且未被活动运行引用的终态任务运行记录',
      run: ({ signal }) =>
        runDatabaseCleanup(signal, () =>
          cleanupScheduledJobRuns(database, retention.jobRunRetentionMs),
        ),
    },
  ]
}
