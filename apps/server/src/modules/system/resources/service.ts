import {
  type ResourceCreateInput,
  type ResourceListQuery,
  type ResourceTreeOptionsQuery,
  type ResourceUpdateInput,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import type { UserAccess } from '../../auth/access'
import { ResourceNotFoundError, toResourceConflictError } from './errors'
import { toResource, toResourceTree, toResourceTreeOptions } from './mapper'
import { createResourceRepository } from './repository'

async function withResourceUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toResourceConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

export function createResourceService(database: Db) {
  const repository = createResourceRepository(database)

  return {
    async list(query: ResourceListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toResource),
      }
    },

    async tree() {
      const rows = await repository.listTreeRows()

      return toResourceTree(rows)
    },

    async treeOptions(query: ResourceTreeOptionsQuery) {
      const rows = await repository.treeOptions(query)

      return toResourceTreeOptions(rows)
    },

    async get(id: string) {
      const resource = await repository.findActiveById(id)

      if (!resource) {
        throw new ResourceNotFoundError()
      }

      return toResource(resource)
    },

    async create(input: ResourceCreateInput, access: UserAccess) {
      return toResource(await withResourceUniqueConflict(() => repository.create(input, access)))
    },

    async update(id: string, input: ResourceUpdateInput, access: UserAccess) {
      const updated = await withResourceUniqueConflict(() => repository.update(id, input, access))

      if (!updated) {
        throw new ResourceNotFoundError()
      }

      return toResource(updated)
    },

    async delete(id: string, access: UserAccess) {
      const deleted = await repository.softDelete(id, access)

      if (!deleted) {
        throw new ResourceNotFoundError()
      }
    },
  }
}
