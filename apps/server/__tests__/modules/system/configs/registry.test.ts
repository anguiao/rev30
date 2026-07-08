import { describe, expect, it } from 'vitest'
import { configKeySchema } from '@rev30/contracts'
import { configRegistry } from '../../../../src/modules/system/configs/registry'

describe('config registry', () => {
  it('keeps registered config definitions valid', () => {
    const messages: string[] = []
    const keys = new Set<string>()

    for (const config of configRegistry) {
      if (!configKeySchema.safeParse(config.key).success) {
        messages.push(`invalid key: ${config.key}`)
      }

      if (keys.has(config.key)) {
        messages.push(`duplicate key: ${config.key}`)
      }
      keys.add(config.key)

      const defaultValueResult = config.schema.safeParse(config.defaultValue)
      if (!defaultValueResult.success) {
        messages.push(`invalid default value: ${config.key}`)
      }
    }

    expect(messages).toEqual([])
  })
})
