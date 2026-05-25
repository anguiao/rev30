import type {
  ConfigCreateInput,
  ConfigListQuery,
  ConfigUpdateInput,
  ConfigValueType,
} from '@rev30/contracts'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import { ConfigInvalidValueError, ConfigNotFoundError, toConfigConflictError } from './errors'
import { toConfig, toConfigListItem, type ConfigRow } from './mapper'
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

function validateConfigValue(valueType: ConfigValueType, value: string) {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    throw new ConfigInvalidValueError('请输入配置值')
  }

  if (valueType === CONFIG_VALUE_TYPE_NUMBER && !Number.isFinite(Number(trimmedValue))) {
    throw new ConfigInvalidValueError('配置值必须是有限数字')
  }

  if (
    valueType === CONFIG_VALUE_TYPE_BOOLEAN &&
    trimmedValue !== 'true' &&
    trimmedValue !== 'false'
  ) {
    throw new ConfigInvalidValueError('配置值必须是 true 或 false')
  }

  if (valueType !== CONFIG_VALUE_TYPE_JSON) {
    return
  }

  try {
    JSON.parse(trimmedValue)
  } catch {
    throw new ConfigInvalidValueError('配置值必须是合法 JSON')
  }
}

function validateMergedValue(input: ConfigUpdateInput, existingConfig: ConfigRow) {
  validateConfigValue(
    (input.valueType ?? existingConfig.valueType) as ConfigValueType,
    input.value ?? existingConfig.value,
  )
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
      return toConfig(await withConfigUniqueConflict(() => repository.create(input)))
    },

    async update(id: string, input: ConfigUpdateInput) {
      const existingConfig = await repository.findActiveById(id)

      if (!existingConfig) {
        throw new ConfigNotFoundError()
      }

      validateMergedValue(input, existingConfig)

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
