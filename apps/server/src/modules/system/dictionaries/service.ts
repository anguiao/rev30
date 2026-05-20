import type {
  DictionaryCreateInput,
  DictionaryListQuery,
  DictionaryOptionsQuery,
  DictionaryOptionsResponse,
  DictionaryUpdateInput,
} from '@rev30/shared'
import type { Db } from '../../../db'
import {
  DictionaryInvalidItemError,
  DictionaryNotFoundError,
  toDictionaryConflictError,
} from './errors'
import { toDictionaryDetail, toDictionaryListItem } from './mapper'
import { createDictionaryRepository } from './repository'

async function withDictionaryConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const conflictError = toDictionaryConflictError(error)

    if (conflictError) {
      throw conflictError
    }

    throw error
  }
}

export function createDictionaryService(database: Db) {
  const repository = createDictionaryRepository(database)

  return {
    async list(query: DictionaryListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toDictionaryListItem),
      }
    },

    async get(id: string) {
      const detail = await repository.findDetailById(id)

      if (!detail) {
        throw new DictionaryNotFoundError()
      }

      return toDictionaryDetail(detail.dictionary, detail.items)
    },

    async options(query: DictionaryOptionsQuery): Promise<DictionaryOptionsResponse> {
      const result = Object.fromEntries(
        query.codes.map((code) => [code, []]),
      ) as DictionaryOptionsResponse
      const rows = await repository.options(query)

      for (const row of rows) {
        result[row.code]?.push({
          label: row.label,
          value: row.value,
        })
      }

      return result
    },

    async create(input: DictionaryCreateInput) {
      const created = await withDictionaryConflict(() => repository.create(input))

      return toDictionaryDetail(created.dictionary, created.items)
    },

    async update(id: string, input: DictionaryUpdateInput) {
      const updated = await withDictionaryConflict(() => repository.update(id, input))

      if (updated.type === 'not_found') {
        throw new DictionaryNotFoundError()
      }

      if (updated.type === 'invalid_item') {
        throw new DictionaryInvalidItemError()
      }

      return toDictionaryDetail(updated.dictionary, updated.items)
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new DictionaryNotFoundError()
      }
    },
  }
}
