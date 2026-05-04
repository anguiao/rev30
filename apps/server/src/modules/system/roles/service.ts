import type { RoleCreateInput, RoleListQuery, RoleResource, RoleUpdateInput } from '@rev30/shared'
import type { Db } from '../../../db'
import { RoleDeleteConflictError, RoleNotFoundError, toRoleConflictError } from './errors'
import { toRole, toRoleListItem } from './mapper'
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

function toRoleResources(
  rows: Awaited<ReturnType<ReturnType<typeof createRoleRepository>['findResourcesByRoleId']>>,
): RoleResource[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type as RoleResource['type'],
  }))
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

    async create(input: RoleCreateInput) {
      const created = await withRoleUniqueConflict(() => repository.create(input))
      const resources = toRoleResources(await repository.findResourcesByRoleId(created.id))

      return toRole(created, resources)
    },

    async update(id: string, input: RoleUpdateInput) {
      const existingRole = await repository.findActiveById(id)

      if (!existingRole) {
        throw new RoleNotFoundError()
      }

      const updated = await withRoleUniqueConflict(() => repository.update(id, input))

      if (!updated) {
        throw new RoleNotFoundError()
      }

      const resources = toRoleResources(await repository.findResourcesByRoleId(id))

      return toRole(updated, resources)
    },

    async delete(id: string) {
      const existingRole = await repository.findActiveById(id)

      if (!existingRole) {
        throw new RoleNotFoundError()
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
