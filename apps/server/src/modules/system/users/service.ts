import type { UserCreateInput, UserListQuery, UserUpdateInput } from '@rev30/shared'
import type { Db } from '../../../db'
import { toUserConflictError, UserNotFoundError } from './errors'
import { toUser } from './mapper'
import { createUserRepository } from './repository'

async function withUserUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toUserConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

export function createUserService(database: Db) {
  const repository = createUserRepository(database)

  return {
    async list(query: UserListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toUser),
      }
    },

    async get(id: string) {
      const user = await repository.findActiveById(id)

      if (!user) {
        throw new UserNotFoundError()
      }

      return toUser(user)
    },

    async create(input: UserCreateInput) {
      return toUser(await withUserUniqueConflict(() => repository.create(input)))
    },

    async update(id: string, input: UserUpdateInput) {
      const updated = await withUserUniqueConflict(() => repository.update(id, input))

      if (!updated) {
        throw new UserNotFoundError()
      }

      return toUser(updated)
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new UserNotFoundError()
      }
    },
  }
}
