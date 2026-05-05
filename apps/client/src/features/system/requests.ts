import {
  departmentTreeNodeSchema,
  errorMessageSchema,
  resourceTreeNodeSchema,
  roleListResponseSchema,
  type DepartmentTreeNode,
  type ResourceTreeNode,
  type RoleListQuery,
  type RoleListResponse,
  type UserListQuery,
  type UserListResponse,
  userListResponseSchema,
} from '@rev30/shared'
import type { z } from 'zod'
import { api } from '../../api'
import { normalizeRequestQuery } from '../../utils/request'

const departmentTreeResponseSchema = departmentTreeNodeSchema.array()
const resourceTreeResponseSchema = resourceTreeNodeSchema.array()

export class SystemRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SystemRequestError'
  }
}

async function parseSystemError(response: Response): Promise<SystemRequestError> {
  try {
    const result = errorMessageSchema.safeParse(await response.json())

    return new SystemRequestError(
      response.status,
      result.success ? result.data.message : '请求失败',
    )
  } catch {
    return new SystemRequestError(response.status, '请求失败')
  }
}

async function parseSystemResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await parseSystemError(response)
  }

  return schema.parse(await response.json())
}

export function getSystemErrorMessage(error: unknown, fallback: string) {
  return error instanceof SystemRequestError ? error.message : fallback
}

export async function listUsers(query: UserListQuery): Promise<UserListResponse> {
  return parseSystemResponse(
    await api.system.users.$get({
      query: normalizeRequestQuery(query),
    }),
    userListResponseSchema,
  )
}

export async function listRoles(query: RoleListQuery): Promise<RoleListResponse> {
  return parseSystemResponse(
    await api.system.roles.$get({
      query: normalizeRequestQuery(query),
    }),
    roleListResponseSchema,
  )
}

export async function getDepartmentTree(): Promise<DepartmentTreeNode[]> {
  return parseSystemResponse(await api.system.departments.tree.$get(), departmentTreeResponseSchema)
}

export async function getResourceTree(): Promise<ResourceTreeNode[]> {
  return parseSystemResponse(await api.system.resources.tree.$get(), resourceTreeResponseSchema)
}
