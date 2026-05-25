import type {
  UserCreateInput,
  UserCreateResponse,
  UserListQuery,
  UserOptionsQuery,
  UserResetPasswordResponse,
  UserUpdateInput,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import { generateTemporaryPassword, hashPassword } from '../../auth/password'
import { BuiltInUserMutationError, toUserConflictError, UserNotFoundError } from './errors'
import { toUser, toUserOption } from './mapper'
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
        list: result.list.map((row) => toUser(row.user, row.departments, row.roles)),
      }
    },

    async get(id: string) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new UserNotFoundError()
      }

      return toUser(row.user, row.departments, row.roles)
    },

    async options(query: UserOptionsQuery) {
      return (await repository.options(query)).map(toUserOption)
    },

    async create(input: UserCreateInput): Promise<UserCreateResponse> {
      const temporaryPassword = generateTemporaryPassword()
      const passwordHash = await hashPassword(temporaryPassword)
      const created = await withUserUniqueConflict(() => repository.create(input, passwordHash))

      return {
        user: toUser(created.user, created.departments, created.roles),
        temporaryPassword,
      }
    },

    async resetPassword(id: string): Promise<UserResetPasswordResponse> {
      const existing = await repository.findActiveById(id)

      if (!existing) {
        throw new UserNotFoundError()
      }

      if (existing.user.builtIn) {
        throw new BuiltInUserMutationError('edit')
      }

      const temporaryPassword = generateTemporaryPassword()
      const passwordHash = await hashPassword(temporaryPassword)
      const updated = await repository.resetPassword(id, passwordHash)

      if (!updated) {
        throw new UserNotFoundError()
      }

      return {
        userId: updated.id,
        temporaryPassword,
      }
    },

    async update(id: string, input: UserUpdateInput) {
      const existing = await repository.findActiveById(id)

      if (!existing) {
        throw new UserNotFoundError()
      }

      if (existing.user.builtIn) {
        throw new BuiltInUserMutationError('edit')
      }

      const updated = await withUserUniqueConflict(() => repository.update(id, input))

      if (!updated) {
        throw new UserNotFoundError()
      }

      return toUser(updated.user, updated.departments, updated.roles)
    },

    async delete(id: string) {
      const existing = await repository.findActiveById(id)

      if (!existing) {
        throw new UserNotFoundError()
      }

      if (existing.user.builtIn) {
        throw new BuiltInUserMutationError('delete')
      }

      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new UserNotFoundError()
      }
    },
  }
}
