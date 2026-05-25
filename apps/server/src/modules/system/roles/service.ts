import {
  BUILT_IN_ADMIN_ROLE_CODE,
  type RoleCreateInput,
  type RoleListQuery,
  type RoleOptionsQuery,
  type RoleUpdateInput,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import {
  BuiltInAdminRoleMutationError,
  RoleDeleteConflictError,
  RoleNotFoundError,
  toRoleConflictError,
} from './errors'
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
        list: result.list.map((row) =>
          toRoleListItem({
            ...row.role,
            userCount: row.userCount,
          }),
        ),
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

    async create(input: RoleCreateInput) {
      const created = await withRoleUniqueConflict(() => repository.create(input))

      return toRole(created.role, toRoleResources(created.resources))
    },

    async update(id: string, input: RoleUpdateInput) {
      const existingRole = await repository.findActiveById(id)

      if (!existingRole) {
        throw new RoleNotFoundError()
      }

      if (existingRole.code === BUILT_IN_ADMIN_ROLE_CODE) {
        throw new BuiltInAdminRoleMutationError('edit')
      }

      const updated = await withRoleUniqueConflict(() => repository.update(id, input))

      if (!updated) {
        throw new RoleNotFoundError()
      }

      return toRole(updated.role, toRoleResources(updated.resources))
    },

    async delete(id: string) {
      const existingRole = await repository.findActiveById(id)

      if (!existingRole) {
        throw new RoleNotFoundError()
      }

      if (existingRole.code === BUILT_IN_ADMIN_ROLE_CODE) {
        throw new BuiltInAdminRoleMutationError('delete')
      }

      if (await repository.hasUsers(id)) {
        throw new RoleDeleteConflictError()
      }

      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new RoleNotFoundError()
      }
    },
  }
}
