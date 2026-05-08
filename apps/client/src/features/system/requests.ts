import {
  departmentTreeNodeSchema,
  errorMessageSchema,
  roleSchema,
  resourceTreeNodeSchema,
  type ErrorMessage,
  type Role,
  type RoleCreateInput,
  type RoleUpdateInput,
  roleListResponseSchema,
  type DepartmentTreeNode,
  type ResourceTreeNode,
  type RoleListQuery,
  type RoleListResponse,
  type User,
  type UserListQuery,
  type UserListResponse,
  type UserUpdateInput,
  userSchema,
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
    public readonly field?: ErrorMessage['field'],
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
      result.success ? result.data.field : undefined,
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

export async function getRole(id: string): Promise<Role> {
  return parseSystemResponse(await api.system.roles[':id'].$get({ param: { id } }), roleSchema)
}

export async function createRole(input: RoleCreateInput): Promise<Role> {
  return parseSystemResponse(await api.system.roles.$post({ json: input }), roleSchema)
}

export async function updateRole(id: string, input: RoleUpdateInput): Promise<Role> {
  return parseSystemResponse(
    await api.system.roles[':id'].$patch({ param: { id }, json: input }),
    roleSchema,
  )
}

export async function deleteRole(id: string): Promise<void> {
  const response = await api.system.roles[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}

export async function getUser(id: string): Promise<User> {
  return parseSystemResponse(await api.system.users[':id'].$get({ param: { id } }), userSchema)
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<User> {
  return parseSystemResponse(
    await api.system.users[':id'].$patch({
      param: { id },
      json: input,
    }),
    userSchema,
  )
}

export async function deleteUser(id: string): Promise<void> {
  const response = await api.system.users[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}
