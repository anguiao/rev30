import { describe, expect, it } from 'vitest'
import { configKeySchema } from '@rev30/contracts'
import { configRegistry } from '../../../../src/modules/system/configs/registry'

describe('config registry', () => {
  it('keeps registered config keys unique', () => {
    const keys = configRegistry.map((config) => config.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(configRegistry)('validates the key and default value for $key', (config) => {
    expect(configKeySchema.parse(config.key)).toBe(config.key)
    expect(() => config.schema.parse(config.defaultValue)).not.toThrow()
  })
})
