import { scheduledJobTaskKeySchema, type ScheduledJobTaskKey } from '@rev30/contracts'
import type { Logger } from 'pino'
import { z } from 'zod'

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

  const sharedKeys = Object.freeze([...scheduledJobTaskKeySchema.options])
  if (
    definitionByKey.size !== sharedKeys.length ||
    sharedKeys.some((key) => !definitionByKey.has(key))
  ) {
    throw new Error('Scheduled Job Registry 必须完整覆盖共享任务 key')
  }

  return {
    get(key) {
      return definitionByKey.get(key)!
    },
    keys() {
      return sharedKeys
    },
  }
}
