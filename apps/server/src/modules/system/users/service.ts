import type {
  SystemUserCreateInput,
  SystemUserListQuery,
  SystemUserUpdateInput,
} from '@rev30/shared'
import type { Db } from '../../../db'
import { SystemUserConflictError, SystemUserNotFoundError } from './errors'
import { toSystemUser } from './mapper'
import { createSystemUserRepository } from './repository'

export { SystemUserConflictError, SystemUserNotFoundError } from './errors'

export function createSystemUserService(database: Db) {
  const repository = createSystemUserRepository(database)

  return {
    async list(query: SystemUserListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toSystemUser),
      }
    },

    async get(id: string) {
      const user = await repository.findActiveById(id)

      if (!user) {
        throw new SystemUserNotFoundError()
      }

      return toSystemUser(user)
    },

    async create(input: SystemUserCreateInput) {
      const conflict = await repository.findUniqueConflict(input)

      if (conflict) {
        throw new SystemUserConflictError(conflict)
      }

      return toSystemUser(await repository.create(input))
    },

    async update(id: string, input: SystemUserUpdateInput) {
      const exists = await repository.existsActive(id)

      if (!exists) {
        throw new SystemUserNotFoundError()
      }

      const conflict = await repository.findUniqueConflict(input, id)

      if (conflict) {
        throw new SystemUserConflictError(conflict)
      }

      const updated = await repository.update(id, input)

      if (!updated) {
        throw new SystemUserNotFoundError()
      }

      return toSystemUser(updated)
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new SystemUserNotFoundError()
      }
    },
  }
}
