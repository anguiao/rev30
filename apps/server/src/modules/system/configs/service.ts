import type { ConfigUpdateInput } from '@rev30/contracts'
import type { Db } from '../../../db'
import { ConfigNotFoundError } from './errors'
import { toConfig } from './mapper'
import { configRegistry, findConfigSpec, validateConfigValue } from './registry'
import { createConfigRepository } from './repository'

export function createConfigService(database: Db) {
  const repository = createConfigRepository(database)

  return {
    async list() {
      const overrides = await repository.listByKeys(configRegistry.map((spec) => spec.key))
      const overridesByKey = new Map(overrides.map((override) => [override.key, override]))

      return configRegistry.map((spec) => toConfig(spec, overridesByKey.get(spec.key)))
    },

    async get(key: string) {
      const spec = findConfigSpec(key)
      if (!spec) {
        throw new ConfigNotFoundError()
      }

      return toConfig(spec, await repository.findByKey(key))
    },

    async update(key: string, input: ConfigUpdateInput) {
      const spec = findConfigSpec(key)
      if (!spec) {
        throw new ConfigNotFoundError()
      }

      if (input.customValue === null) {
        await repository.deleteByKey(key)

        return toConfig(spec, undefined)
      }

      validateConfigValue(spec, input.customValue)

      return toConfig(spec, await repository.upsert(key, input.customValue))
    },
  }
}
