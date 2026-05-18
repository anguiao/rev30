import type { ConfigCreateInput, ConfigListQuery, ConfigUpdateInput } from '@rev30/shared'
import { getConfigValueError } from '@rev30/shared'
import type { Db } from '../../../db'
import { ConfigInvalidValueError, ConfigNotFoundError, toConfigConflictError } from './errors'
import { toConfig, toConfigListItem } from './mapper'
import { createConfigRepository } from './repository'

async function withConfigUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toConfigConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

function validateMergedValue(input: {
  valueType: ConfigCreateInput['valueType']
  value: string
}) {
  const message = getConfigValueError(input.valueType, input.value)

  if (message !== null) {
    throw new ConfigInvalidValueError(message)
  }
}

export function createConfigService(database: Db) {
  const repository = createConfigRepository(database)

  return {
    async list(query: ConfigListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toConfigListItem),
      }
    },

    async get(id: string) {
      const config = await repository.findActiveById(id)

      if (!config) {
        throw new ConfigNotFoundError()
      }

      return toConfig(config)
    },

    async create(input: ConfigCreateInput) {
      validateMergedValue(input)

      return toConfig(await withConfigUniqueConflict(() => repository.create(input)))
    },

    async update(id: string, input: ConfigUpdateInput) {
      const existingConfig = await repository.findActiveById(id)

      if (!existingConfig) {
        throw new ConfigNotFoundError()
      }

      validateMergedValue({
        valueType: (input.valueType ??
          existingConfig.valueType) as ConfigCreateInput['valueType'],
        value: input.value ?? existingConfig.value,
      })

      const updated = await withConfigUniqueConflict(() => repository.update(id, input))

      if (!updated) {
        throw new ConfigNotFoundError()
      }

      return toConfig(updated)
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new ConfigNotFoundError()
      }
    },
  }
}
