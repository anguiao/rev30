import {
  departmentSchema,
  departmentTreeResponseSchema,
  type Department,
  type DepartmentCreateInput,
  errorResponseSchema,
  roleSchema,
  resourceTreeResponseSchema,
  resourceSchema,
  type ErrorResponse,
  type Role,
  type RoleCreateInput,
  type RoleUpdateInput,
  type Resource,
  type ResourceCreateInput,
  type ResourceUpdateInput,
  roleListResponseSchema,
  type DepartmentUpdateInput,
  type RoleListQuery,
  type RoleListResponse,
  type User,
  type UserListQuery,
  type UserListResponse,
  type UserCreateInput,
  type UserCreateResponse,
  type UserResetPasswordResponse,
  userOptionsResponseSchema,
  type UserOptionsResponse,
  roleOptionsResponseSchema,
  type RoleOptionsResponse,
  configListResponseSchema,
  configSchema,
  type Config,
  type ConfigCreateInput,
  type ConfigListQuery,
  type ConfigListResponse,
  type ConfigUpdateInput,
  departmentTreeOptionsResponseSchema,
  type DepartmentTreeOptionsResponse,
  type DepartmentTreeResponse,
  resourceTreeOptionsResponseSchema,
  type ResourceTreeOptionsResponse,
  type ResourceTreeResponse,
  type UserUpdateInput,
  type IconSearchQuery,
  type IconSearchResponse,
  userCreateResponseSchema,
  userSchema,
  userListResponseSchema,
  userResetPasswordResponseSchema,
  iconSearchResponseSchema,
  dictionaryListResponseSchema,
  dictionaryDetailSchema,
  dictionaryOptionsResponseSchema,
  type DictionaryListQuery,
  type DictionaryListResponse,
  type DictionaryDetail,
  type DictionaryCreateInput,
  type DictionaryUpdateInput,
  type DictionaryOptionsResponse,
} from '@rev30/shared'
import type { z } from 'zod'
import { api } from '../../api'
import { normalizeRequestQuery } from '../../utils/request'

export class SystemRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: ErrorResponse['field'],
  ) {
    super(message)
    this.name = 'SystemRequestError'
  }
}

async function parseSystemError(response: Response): Promise<SystemRequestError> {
  try {
    const result = errorResponseSchema.safeParse(await response.json())

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

export async function getUser(id: string): Promise<User> {
  return parseSystemResponse(await api.system.users[':id'].$get({ param: { id } }), userSchema)
}

export async function getUserOptions(includeIds: string[] = []): Promise<UserOptionsResponse> {
  return parseSystemResponse(
    await api.system.users.options.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    userOptionsResponseSchema,
  )
}

export async function createUser(input: UserCreateInput): Promise<UserCreateResponse> {
  return parseSystemResponse(
    await api.system.users.$post({ json: input }),
    userCreateResponseSchema,
  )
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

export async function resetUserPassword(id: string): Promise<UserResetPasswordResponse> {
  return parseSystemResponse(
    await api.system.users[':id']['password']['reset'].$post({
      param: { id },
    }),
    userResetPasswordResponseSchema,
  )
}

export async function getDepartmentTree(): Promise<DepartmentTreeResponse> {
  return parseSystemResponse(await api.system.departments.tree.$get(), departmentTreeResponseSchema)
}

export async function getDepartmentTreeOptions(
  includeIds: string[] = [],
): Promise<DepartmentTreeOptionsResponse> {
  return parseSystemResponse(
    await api.system.departments.options.tree.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    departmentTreeOptionsResponseSchema,
  )
}

export async function getDepartment(id: string): Promise<Department> {
  return parseSystemResponse(
    await api.system.departments[':id'].$get({ param: { id } }),
    departmentSchema,
  )
}

export async function createDepartment(input: DepartmentCreateInput): Promise<Department> {
  return parseSystemResponse(await api.system.departments.$post({ json: input }), departmentSchema)
}

export async function updateDepartment(
  id: string,
  input: DepartmentUpdateInput,
): Promise<Department> {
  return parseSystemResponse(
    await api.system.departments[':id'].$patch({
      param: { id },
      json: input,
    }),
    departmentSchema,
  )
}

export async function deleteDepartment(id: string): Promise<void> {
  const response = await api.system.departments[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}

export async function listRoles(query: RoleListQuery): Promise<RoleListResponse> {
  return parseSystemResponse(
    await api.system.roles.$get({
      query: normalizeRequestQuery(query),
    }),
    roleListResponseSchema,
  )
}

export async function getRole(id: string): Promise<Role> {
  return parseSystemResponse(await api.system.roles[':id'].$get({ param: { id } }), roleSchema)
}

export async function getRoleOptions(includeIds: string[] = []): Promise<RoleOptionsResponse> {
  return parseSystemResponse(
    await api.system.roles.options.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    roleOptionsResponseSchema,
  )
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

export async function getResourceTree(): Promise<ResourceTreeResponse> {
  return parseSystemResponse(await api.system.resources.tree.$get(), resourceTreeResponseSchema)
}

export async function getResourceTreeOptions(
  includeIds: string[] = [],
): Promise<ResourceTreeOptionsResponse> {
  return parseSystemResponse(
    await api.system.resources.options.tree.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    resourceTreeOptionsResponseSchema,
  )
}

export async function getResource(id: string): Promise<Resource> {
  return parseSystemResponse(
    await api.system.resources[':id'].$get({ param: { id } }),
    resourceSchema,
  )
}

export async function createResource(input: ResourceCreateInput): Promise<Resource> {
  return parseSystemResponse(await api.system.resources.$post({ json: input }), resourceSchema)
}

export async function updateResource(id: string, input: ResourceUpdateInput): Promise<Resource> {
  return parseSystemResponse(
    await api.system.resources[':id'].$patch({ param: { id }, json: input }),
    resourceSchema,
  )
}

export async function deleteResource(id: string): Promise<void> {
  const response = await api.system.resources[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}

export async function listConfigs(query: ConfigListQuery): Promise<ConfigListResponse> {
  return parseSystemResponse(
    await api.system.configs.$get({
      query: normalizeRequestQuery(query),
    }),
    configListResponseSchema,
  )
}

export async function getConfig(id: string): Promise<Config> {
  return parseSystemResponse(await api.system.configs[':id'].$get({ param: { id } }), configSchema)
}

export async function createConfig(input: ConfigCreateInput): Promise<Config> {
  return parseSystemResponse(await api.system.configs.$post({ json: input }), configSchema)
}

export async function updateConfig(id: string, input: ConfigUpdateInput): Promise<Config> {
  return parseSystemResponse(
    await api.system.configs[':id'].$patch({ param: { id }, json: input }),
    configSchema,
  )
}

export async function deleteConfig(id: string): Promise<void> {
  const response = await api.system.configs[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}

export async function listDictionaries(
  query: DictionaryListQuery,
): Promise<DictionaryListResponse> {
  return parseSystemResponse(
    await api.system.dictionaries.$get({
      query: normalizeRequestQuery(query),
    }),
    dictionaryListResponseSchema,
  )
}

export async function getDictionary(id: string): Promise<DictionaryDetail> {
  return parseSystemResponse(
    await api.system.dictionaries[':id'].$get({ param: { id } }),
    dictionaryDetailSchema,
  )
}

export async function createDictionary(input: DictionaryCreateInput): Promise<DictionaryDetail> {
  return parseSystemResponse(
    await api.system.dictionaries.$post({ json: input }),
    dictionaryDetailSchema,
  )
}

export async function updateDictionary(
  id: string,
  input: DictionaryUpdateInput,
): Promise<DictionaryDetail> {
  return parseSystemResponse(
    await api.system.dictionaries[':id'].$put({
      param: { id },
      json: input,
    }),
    dictionaryDetailSchema,
  )
}

export async function deleteDictionary(id: string): Promise<void> {
  const response = await api.system.dictionaries[':id'].$delete({ param: { id } })

  if (!response.ok) {
    throw await parseSystemError(response)
  }
}

export async function getDictionaryOptions(codes: string[]): Promise<DictionaryOptionsResponse> {
  return parseSystemResponse(
    await api.system.dictionaries.options.$get({
      query: normalizeRequestQuery({ codes: codes.join(',') }) as { codes: string },
    }),
    dictionaryOptionsResponseSchema,
  )
}

export async function searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
  return parseSystemResponse(
    await api.icons.search.$get({
      query: normalizeRequestQuery(query),
    }),
    iconSearchResponseSchema,
  )
}
