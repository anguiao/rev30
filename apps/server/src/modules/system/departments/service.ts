import type {
  DepartmentCreateInput,
  DepartmentListQuery,
  DepartmentUpdateInput,
} from '@rev30/shared'
import type { Db } from '../../../db'
import {
  DepartmentDeleteConflictError,
  DepartmentInvalidParentError,
  DepartmentMoveConflictError,
  DepartmentNotFoundError,
  toDepartmentConflictError,
} from './errors'
import { toDepartment, toDepartmentTree } from './mapper'
import { createDepartmentRepository } from './repository'

async function withDepartmentUniqueConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    const uniqueConflict = toDepartmentConflictError(error)

    if (uniqueConflict) {
      throw uniqueConflict
    }

    throw error
  }
}

export function createDepartmentService(database: Db) {
  const repository = createDepartmentRepository(database)

  async function validateParent(parentId: string) {
    const parent = await repository.findActiveById(parentId)

    if (!parent) {
      throw new DepartmentInvalidParentError()
    }
  }

  async function isSelfOrDescendant(id: string, parentId: string) {
    let currentParentId: string | null = parentId

    while (currentParentId) {
      if (currentParentId === id) {
        return true
      }

      const currentParent = await repository.findActiveById(currentParentId)

      if (!currentParent) {
        return false
      }

      currentParentId = currentParent.parentId
    }

    return false
  }

  return {
    async list(query: DepartmentListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toDepartment),
      }
    },

    async tree() {
      const rows = await repository.listTreeRows()

      return toDepartmentTree(rows)
    },

    async get(id: string) {
      const department = await repository.findActiveById(id)

      if (!department) {
        throw new DepartmentNotFoundError()
      }

      return toDepartment(department)
    },

    async create(input: DepartmentCreateInput) {
      if (input.parentId !== null) {
        await validateParent(input.parentId)
      }

      return toDepartment(await withDepartmentUniqueConflict(() => repository.create(input)))
    },

    async update(id: string, input: DepartmentUpdateInput) {
      const existingDepartment = await repository.findActiveById(id)

      if (!existingDepartment) {
        throw new DepartmentNotFoundError()
      }

      if (input.parentId !== undefined) {
        if (input.parentId === id) {
          throw new DepartmentMoveConflictError()
        }

        if (input.parentId !== null) {
          await validateParent(input.parentId)

          const selfOrDescendant = await isSelfOrDescendant(id, input.parentId)

          if (selfOrDescendant) {
            throw new DepartmentMoveConflictError()
          }
        }
      }

      const updated = await withDepartmentUniqueConflict(() => repository.update(id, input))

      if (!updated) {
        throw new DepartmentNotFoundError()
      }

      return toDepartment(updated)
    },

    async delete(id: string) {
      const existingDepartment = await repository.findActiveById(id)

      if (!existingDepartment) {
        throw new DepartmentNotFoundError()
      }

      if (await repository.hasActiveChildren(id)) {
        throw new DepartmentDeleteConflictError('部门存在子部门，不能删除')
      }

      if (await repository.hasUsers(id)) {
        throw new DepartmentDeleteConflictError('部门存在关联用户，不能删除')
      }

      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new DepartmentNotFoundError()
      }
    },
  }
}
