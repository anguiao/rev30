import { scheduledJobTaskKeySchema } from '@rev30/contracts'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import {
  createScheduledJobRegistry,
  scheduledJobTaskKeys,
  scheduledJobResultSchema,
  type ScheduledJobDefinition,
} from '../../../../src/modules/ops/scheduled-jobs/registry'

const logger = {} as Logger

function definition(key: (typeof scheduledJobTaskKeys)[number]): ScheduledJobDefinition {
  return {
    key,
    name: `Name for ${key}`,
    description: `Description for ${key}`,
    run: vi.fn().mockResolvedValue({ deletedCount: 0, failedCount: 0 }),
  }
}

describe('scheduled job registry', () => {
  it('uses contract-compatible keys', () => {
    for (const taskKey of scheduledJobTaskKeys) {
      expect(scheduledJobTaskKeySchema.parse(taskKey)).toBe(taskKey)
    }
  })

  it('requires unique definitions that completely cover the predefined task keys', () => {
    expect(() => createScheduledJobRegistry(scheduledJobTaskKeys.slice(1).map(definition))).toThrow(
      /完整覆盖/,
    )
    expect(() =>
      createScheduledJobRegistry([
        ...scheduledJobTaskKeys.map(definition),
        definition(scheduledJobTaskKeys[0]),
      ]),
    ).toThrow(/重复/)
  })

  it('returns definitions by key and preserves the signal and logger run boundary', async () => {
    const definitions = scheduledJobTaskKeys.map(definition)
    const registry = createScheduledJobRegistry(definitions)
    const controller = new AbortController()
    const target = registry.get(scheduledJobTaskKeys[0])

    await expect(target.run({ signal: controller.signal, logger })).resolves.toEqual({
      deletedCount: 0,
      failedCount: 0,
    })
    expect(target).toBe(definitions[0])
    expect(registry.keys()).toEqual(scheduledJobTaskKeys)
    expect(target.run).toHaveBeenCalledWith({ signal: controller.signal, logger })
    expect(() => registry.get('unknown-task')).toThrow(/不存在 key/)
  })

  it('strictly validates safe handler result counts', () => {
    expect(scheduledJobResultSchema.parse({ deletedCount: 3, failedCount: 0 })).toEqual({
      deletedCount: 3,
      failedCount: 0,
    })
    expect(() =>
      scheduledJobResultSchema.parse({ deletedCount: 3, failedCount: 0, rawError: 'secret' }),
    ).toThrow()
    expect(() => scheduledJobResultSchema.parse({ deletedCount: -1, failedCount: 0 })).toThrow()
  })
})
