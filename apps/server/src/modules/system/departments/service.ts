import type {
  DepartmentCreateInput,
  DepartmentListQuery,
  DepartmentTreeOptionsQuery,
  DepartmentUpdateInput,
} from '@rev30/contracts'
import type { Db } from '../../../db'
import { DepartmentNotFoundError, toDepartmentConflictError } from './errors'
import { toDepartment, toDepartmentTree, toDepartmentTreeOptions } from './mapper'
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

    async treeOptions(query: DepartmentTreeOptionsQuery) {
      const rows = await repository.treeOptions(query)

      return toDepartmentTreeOptions(rows)
    },

    async get(id: string) {
      const department = await repository.findActiveById(id)

      if (!department) {
        throw new DepartmentNotFoundError()
      }

      return toDepartment(department)
    },

    async create(input: DepartmentCreateInput) {
      return toDepartment(await withDepartmentUniqueConflict(() => repository.create(input)))
    },

    async update(id: string, input: DepartmentUpdateInput) {
      const updated = await withDepartmentUniqueConflict(() => repository.update(id, input))

      if (!updated) {
        throw new DepartmentNotFoundError()
      }

      return toDepartment(updated)
    },

    async delete(id: string) {
      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new DepartmentNotFoundError()
      }
    },
  }
}
