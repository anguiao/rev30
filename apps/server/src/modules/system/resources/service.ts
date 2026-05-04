import {
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_TYPE_ACTION,
  RESOURCE_TYPE_DIRECTORY,
  RESOURCE_TYPE_EXTERNAL,
  RESOURCE_TYPE_MENU,
  type Resource,
  type ResourceCreateInput,
  type ResourceListQuery,
  type ResourceUpdateInput,
} from '@rev30/shared'
import type { Db } from '../../../db'
import {
  ResourceDeleteConflictError,
  ResourceInvalidParentError,
  ResourceInvalidTypeFieldsError,
  ResourceMoveConflictError,
  ResourceNotFoundError,
  toResourceConflictError,
} from './errors'
import { toResource, toResourceTree, type ResourceRow } from './mapper'
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

function normalizeTypeFields(input: ResourceUpdateInput, existing?: ResourceRow): ResourceUpdateInput {
  const type = input.type ?? (existing?.type as Resource['type'] | undefined)
  const next: ResourceUpdateInput = { ...input }
  const path = input.path !== undefined ? input.path : existing?.path
  const externalUrl = input.externalUrl !== undefined ? input.externalUrl : existing?.externalUrl

  if (type === RESOURCE_TYPE_MENU) {
    if (path === null || path === undefined) {
      throw new ResourceInvalidTypeFieldsError('内部菜单路径不能为空')
    }

    next.path = path
    next.externalUrl = null
  }

  if (type === RESOURCE_TYPE_EXTERNAL) {
    if (externalUrl === null || externalUrl === undefined) {
      throw new ResourceInvalidTypeFieldsError('外链地址不能为空')
    }

    next.path = null
    next.externalUrl = externalUrl
  }

  if (type === RESOURCE_TYPE_DIRECTORY || type === RESOURCE_TYPE_ACTION) {
    next.path = null
    next.externalUrl = null
    next.openTarget = RESOURCE_OPEN_TARGET_SELF
  }

  return next
}

export function createResourceService(database: Db) {
  const repository = createResourceRepository(database)

  async function validateParent(parentId: string) {
    const parent = await repository.findActiveById(parentId)

    if (!parent) {
      throw new ResourceInvalidParentError()
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

    async get(id: string) {
      const resource = await repository.findActiveById(id)

      if (!resource) {
        throw new ResourceNotFoundError()
      }

      return toResource(resource)
    },

    async create(input: ResourceCreateInput) {
      if (input.parentId !== null) {
        await validateParent(input.parentId)
      }

      return toResource(await withResourceUniqueConflict(() => repository.create(input)))
    },

    async update(id: string, input: ResourceUpdateInput) {
      const existingResource = await repository.findActiveById(id)

      if (!existingResource) {
        throw new ResourceNotFoundError()
      }

      if (input.parentId !== undefined) {
        if (input.parentId === id) {
          throw new ResourceMoveConflictError()
        }

        if (input.parentId !== null) {
          await validateParent(input.parentId)

          const selfOrDescendant = await isSelfOrDescendant(id, input.parentId)

          if (selfOrDescendant) {
            throw new ResourceMoveConflictError()
          }
        }
      }

      const normalizedInput = normalizeTypeFields(input, existingResource)
      const updated = await withResourceUniqueConflict(() => repository.update(id, normalizedInput))

      if (!updated) {
        throw new ResourceNotFoundError()
      }

      return toResource(updated)
    },

    async delete(id: string) {
      const existingResource = await repository.findActiveById(id)

      if (!existingResource) {
        throw new ResourceNotFoundError()
      }

      if (await repository.hasActiveChildren(id)) {
        throw new ResourceDeleteConflictError()
      }

      const deleted = await repository.softDelete(id)

      if (!deleted) {
        throw new ResourceNotFoundError()
      }
    },
  }
}
