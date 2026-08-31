import type { ScheduledJobTaskKey } from '@rev30/contracts'
import type { Logger } from 'pino'
import { z } from 'zod'

export const SCHEDULED_JOB_TASK_KEY_AUTH_SESSION_CLEANUP = 'auth-session-cleanup'
export const SCHEDULED_JOB_TASK_KEY_AUTH_LOGIN_ATTEMPT_CLEANUP = 'auth-login-attempt-cleanup'
export const SCHEDULED_JOB_TASK_KEY_OPS_LOGIN_LOG_CLEANUP = 'ops-login-log-cleanup'
export const SCHEDULED_JOB_TASK_KEY_OPS_OPERATION_LOG_CLEANUP = 'ops-operation-log-cleanup'
export const SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP =
  'attachment-expired-upload-session-cleanup'
export const SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP =
  'attachment-unreferenced-cleanup'
export const SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP =
  'attachment-orphaned-storage-cleanup'
export const SCHEDULED_JOB_TASK_KEY_OPS_JOB_RUN_CLEANUP = 'ops-job-run-cleanup'

export const scheduledJobTaskKeys = [
  SCHEDULED_JOB_TASK_KEY_AUTH_SESSION_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_AUTH_LOGIN_ATTEMPT_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_OPS_LOGIN_LOG_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_OPS_OPERATION_LOG_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_EXPIRED_UPLOAD_SESSION_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_UNREFERENCED_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_ATTACHMENT_ORPHANED_STORAGE_CLEANUP,
  SCHEDULED_JOB_TASK_KEY_OPS_JOB_RUN_CLEANUP,
] as const satisfies readonly ScheduledJobTaskKey[]

const scheduledJobCountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

export const scheduledJobResultSchema = z
  .object({
    deletedCount: scheduledJobCountSchema,
    failedCount: scheduledJobCountSchema,
  })
  .strict()

export type ScheduledJobResult = z.infer<typeof scheduledJobResultSchema>

export type ScheduledJobDefinition = {
  key: ScheduledJobTaskKey
  name: string
  description: string
  run: (context: { signal: AbortSignal; logger: Logger }) => Promise<ScheduledJobResult>
}

export type ScheduledJobRegistry = {
  get(key: ScheduledJobTaskKey): ScheduledJobDefinition
  keys(): readonly ScheduledJobTaskKey[]
}

export function createScheduledJobRegistry(
  definitions: readonly ScheduledJobDefinition[],
): ScheduledJobRegistry {
  const definitionByKey = new Map<ScheduledJobTaskKey, ScheduledJobDefinition>()

  for (const definition of definitions) {
    if (definitionByKey.has(definition.key)) {
      throw new Error(`Scheduled Job Registry 包含重复 key: ${definition.key}`)
    }
    definitionByKey.set(definition.key, definition)
  }

  if (
    definitionByKey.size !== scheduledJobTaskKeys.length ||
    scheduledJobTaskKeys.some((key) => !definitionByKey.has(key))
  ) {
    throw new Error('Scheduled Job Registry 必须完整覆盖预定义任务 key')
  }

  return {
    get(key) {
      const definition = definitionByKey.get(key)
      if (!definition) throw new Error(`Scheduled Job Registry 不存在 key: ${key}`)
      return definition
    },
    keys() {
      return scheduledJobTaskKeys
    },
  }
}
