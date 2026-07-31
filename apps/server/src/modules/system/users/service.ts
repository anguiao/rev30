import {
  type UserCreateInput,
  type UserCreateResponse,
  type UserListQuery,
  type UserOptionsQuery,
  type UserResetPasswordResponse,
  type UserUpdateInput,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import type { UserAccess } from '../../auth/access'
import { generateTemporaryPassword, hashPassword } from '../../auth/password'
import { toUserConflictError, toUserInvalidAvatarError, UserNotFoundError } from './errors'
import { toUser, toUserOption } from './mapper'
import { createUserRepository } from './repository'

async function withUserWriteConstraints<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toUserConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    const invalidAvatar = toUserInvalidAvatarError(error)

    if (invalidAvatar) {
      throw invalidAvatar
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

    async create(input: UserCreateInput, access: UserAccess): Promise<UserCreateResponse> {
      const temporaryPassword = generateTemporaryPassword()
      const passwordHash = await hashPassword(temporaryPassword)
      const created = await withUserWriteConstraints(() =>
        repository.create(input, passwordHash, access),
      )

      return {
        user: toUser(created.user, created.departments, created.roles),
        temporaryPassword,
      }
    },

    async resetPassword(id: string, access: UserAccess): Promise<UserResetPasswordResponse> {
      const temporaryPassword = generateTemporaryPassword()
      const passwordHash = await hashPassword(temporaryPassword)
      const updated = await repository.resetPassword(id, passwordHash, access)

      if (!updated) {
        throw new UserNotFoundError()
      }

      return {
        userId: updated.id,
        temporaryPassword,
      }
    },

    async update(id: string, input: UserUpdateInput, access: UserAccess) {
      const updated = await withUserWriteConstraints(() => repository.update(id, input, access))

      if (!updated) {
        throw new UserNotFoundError()
      }

      return toUser(updated.user, updated.departments, updated.roles)
    },

    async delete(id: string, access: UserAccess) {
      const deleted = await repository.softDelete(id, access)

      if (!deleted) {
        throw new UserNotFoundError()
      }
    },
  }
}
