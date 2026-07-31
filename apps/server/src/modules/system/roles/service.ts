import {
  type RoleCreateInput,
  type RoleListQuery,
  type RoleOptionsQuery,
  type RoleUpdateInput,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import type { UserAccess } from '../../auth/access'
import { RoleNotFoundError, toRoleConflictError } from './errors'
import { toRole, toRoleListItem, toRoleOption, toRoleResources } from './mapper'
import { createRoleRepository } from './repository'

async function withRoleUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toRoleConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

export function createRoleService(database: Db) {
  const repository = createRoleRepository(database)

  return {
    async list(query: RoleListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toRoleListItem),
      }
    },

    async get(id: string) {
      const role = await repository.findActiveById(id)

      if (!role) {
        throw new RoleNotFoundError()
      }

      const resources = toRoleResources(await repository.findResourcesByRoleId(id))

      return toRole(role, resources)
    },

    async options(query: RoleOptionsQuery) {
      return (await repository.options(query)).map(toRoleOption)
    },

    async create(input: RoleCreateInput, access: UserAccess) {
      const created = await withRoleUniqueConflict(() => repository.create(input, access))

      return toRole(created.role, toRoleResources(created.resources))
    },

    async update(id: string, input: RoleUpdateInput, access: UserAccess) {
      const updated = await withRoleUniqueConflict(() => repository.update(id, input, access))

      if (!updated) {
        throw new RoleNotFoundError()
      }

      return toRole(updated.role, toRoleResources(updated.resources))
    },

    async delete(id: string, access: UserAccess) {
      const deleted = await repository.softDelete(id, access)

      if (!deleted) {
        throw new RoleNotFoundError()
      }
    },
  }
}
