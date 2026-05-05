import {
  departmentTreeNodeSchema,
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
import { api } from '../../api'

const fallbackErrorMessage = '请求失败'

type RequestQueryValue = string | number | undefined

type UserListRequestQuery =
  NonNullable<Parameters<typeof api.system.users.$get>[0]> extends {
    query: infer TQuery
  }
    ? TQuery
    : never

type RoleListRequestQuery =
  NonNullable<Parameters<typeof api.system.roles.$get>[0]> extends {
    query: infer TQuery
  }
    ? TQuery
    : never

function toRequestQueryEntry(value: RequestQueryValue): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string' && value === '') {
    return undefined
  }

  return String(value)
}

function createRequestQuery<T extends Record<string, RequestQueryValue>>(query: T) {
  const requestQuery = {} as Partial<Record<keyof T, string>>

  for (const [key, value] of Object.entries(query) as [keyof T, T[keyof T]][]) {
    const entry = toRequestQueryEntry(value)

    if (entry !== undefined) {
      requestQuery[key] = entry
    }
  }

  return requestQuery
}

export class SystemRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SystemRequestError'
  }
}

function parseErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return fallbackErrorMessage
}

async function parseSystemError(response: Response): Promise<SystemRequestError> {
  try {
    return new SystemRequestError(response.status, parseErrorMessage(await response.json()))
  } catch {
    return new SystemRequestError(response.status, fallbackErrorMessage)
  }
}

async function parseSystemResponse<T>(response: Response, parse: (json: unknown) => T): Promise<T> {
  if (!response.ok) {
    throw await parseSystemError(response)
  }

  return parse(await response.json())
}

function toUserListQuery(query: UserListQuery): UserListRequestQuery {
  return createRequestQuery({
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword,
    status: query.status,
  }) as UserListRequestQuery
}

function toRoleListQuery(query: RoleListQuery): RoleListRequestQuery {
  return createRequestQuery({
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword,
    status: query.status,
  }) as RoleListRequestQuery
}

export function getSystemErrorMessage(error: unknown, fallback: string) {
  return error instanceof SystemRequestError ? error.message : fallback
}

export async function listUsers(query: UserListQuery): Promise<UserListResponse> {
  const response = await api.system.users.$get({
    query: toUserListQuery(query),
  })

  return parseSystemResponse(response, (json) => userListResponseSchema.parse(json))
}

export async function listRoles(query: RoleListQuery): Promise<RoleListResponse> {
  const response = await api.system.roles.$get({
    query: toRoleListQuery(query),
  })

  return parseSystemResponse(response, (json) => roleListResponseSchema.parse(json))
}

export async function getDepartmentTree(): Promise<DepartmentTreeNode[]> {
  const response = await api.system.departments.tree.$get()

  return parseSystemResponse(response, (json) => departmentTreeNodeSchema.array().parse(json))
}

export async function getResourceTree(): Promise<ResourceTreeNode[]> {
  const response = await api.system.resources.tree.$get()

  return parseSystemResponse(response, (json) => resourceTreeNodeSchema.array().parse(json))
}
