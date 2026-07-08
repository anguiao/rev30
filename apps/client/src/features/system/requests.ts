import {
  departmentSchema,
  departmentTreeResponseSchema,
  type Department,
  type DepartmentCreateInput,
  roleSchema,
  resourceTreeResponseSchema,
  resourceSchema,
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
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function listUsers(query: UserListQuery): Promise<UserListResponse> {
  return parseApiResponse(
    await api.system.users.$get({
      query: normalizeRequestQuery(query),
    }),
    userListResponseSchema,
  )
}

export async function getUser(id: string): Promise<User> {
  return parseApiResponse(await api.system.users[':id'].$get({ param: { id } }), userSchema)
}

export async function getUserOptions(includeIds: string[] = []): Promise<UserOptionsResponse> {
  return parseApiResponse(
    await api.system.users.options.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    userOptionsResponseSchema,
  )
}

export async function createUser(input: UserCreateInput): Promise<UserCreateResponse> {
  return parseApiResponse(await api.system.users.$post({ json: input }), userCreateResponseSchema)
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<User> {
  return parseApiResponse(
    await api.system.users[':id'].$patch({
      param: { id },
      json: input,
    }),
    userSchema,
  )
}

export async function deleteUser(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.users[':id'].$delete({ param: { id } }))
}

export async function resetUserPassword(id: string): Promise<UserResetPasswordResponse> {
  return parseApiResponse(
    await api.system.users[':id']['password']['reset'].$post({
      param: { id },
    }),
    userResetPasswordResponseSchema,
  )
}

export async function getDepartmentTree(): Promise<DepartmentTreeResponse> {
  return parseApiResponse(await api.system.departments.tree.$get(), departmentTreeResponseSchema)
}

export async function getDepartmentTreeOptions(
  includeIds: string[] = [],
): Promise<DepartmentTreeOptionsResponse> {
  return parseApiResponse(
    await api.system.departments.options.tree.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    departmentTreeOptionsResponseSchema,
  )
}

export async function getDepartment(id: string): Promise<Department> {
  return parseApiResponse(
    await api.system.departments[':id'].$get({ param: { id } }),
    departmentSchema,
  )
}

export async function createDepartment(input: DepartmentCreateInput): Promise<Department> {
  return parseApiResponse(await api.system.departments.$post({ json: input }), departmentSchema)
}

export async function updateDepartment(
  id: string,
  input: DepartmentUpdateInput,
): Promise<Department> {
  return parseApiResponse(
    await api.system.departments[':id'].$patch({
      param: { id },
      json: input,
    }),
    departmentSchema,
  )
}

export async function deleteDepartment(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.departments[':id'].$delete({ param: { id } }))
}

export async function listRoles(query: RoleListQuery): Promise<RoleListResponse> {
  return parseApiResponse(
    await api.system.roles.$get({
      query: normalizeRequestQuery(query),
    }),
    roleListResponseSchema,
  )
}

export async function getRole(id: string): Promise<Role> {
  return parseApiResponse(await api.system.roles[':id'].$get({ param: { id } }), roleSchema)
}

export async function getRoleOptions(includeIds: string[] = []): Promise<RoleOptionsResponse> {
  return parseApiResponse(
    await api.system.roles.options.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    roleOptionsResponseSchema,
  )
}

export async function createRole(input: RoleCreateInput): Promise<Role> {
  return parseApiResponse(await api.system.roles.$post({ json: input }), roleSchema)
}

export async function updateRole(id: string, input: RoleUpdateInput): Promise<Role> {
  return parseApiResponse(
    await api.system.roles[':id'].$patch({ param: { id }, json: input }),
    roleSchema,
  )
}

export async function deleteRole(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.roles[':id'].$delete({ param: { id } }))
}

export async function getResourceTree(): Promise<ResourceTreeResponse> {
  return parseApiResponse(await api.system.resources.tree.$get(), resourceTreeResponseSchema)
}

export async function getResourceTreeOptions(
  includeIds: string[] = [],
): Promise<ResourceTreeOptionsResponse> {
  return parseApiResponse(
    await api.system.resources.options.tree.$get({
      query: normalizeRequestQuery({ includeIds: includeIds.join(',') }),
    }),
    resourceTreeOptionsResponseSchema,
  )
}

export async function getResource(id: string): Promise<Resource> {
  return parseApiResponse(await api.system.resources[':id'].$get({ param: { id } }), resourceSchema)
}

export async function createResource(input: ResourceCreateInput): Promise<Resource> {
  return parseApiResponse(await api.system.resources.$post({ json: input }), resourceSchema)
}

export async function updateResource(id: string, input: ResourceUpdateInput): Promise<Resource> {
  return parseApiResponse(
    await api.system.resources[':id'].$patch({ param: { id }, json: input }),
    resourceSchema,
  )
}

export async function deleteResource(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.resources[':id'].$delete({ param: { id } }))
}

export async function listConfigs(): Promise<ConfigListResponse> {
  return parseApiResponse(await api.system.configs.$get(), configListResponseSchema)
}

export async function getConfig(key: string): Promise<Config> {
  return parseApiResponse(await api.system.configs[':key'].$get({ param: { key } }), configSchema)
}

export async function updateConfig(key: string, input: ConfigUpdateInput): Promise<Config> {
  return parseApiResponse(
    await api.system.configs[':key'].$put({ param: { key }, json: input }),
    configSchema,
  )
}

export async function listDictionaries(
  query: DictionaryListQuery,
): Promise<DictionaryListResponse> {
  return parseApiResponse(
    await api.system.dictionaries.$get({
      query: normalizeRequestQuery(query),
    }),
    dictionaryListResponseSchema,
  )
}

export async function getDictionary(id: string): Promise<DictionaryDetail> {
  return parseApiResponse(
    await api.system.dictionaries[':id'].$get({ param: { id } }),
    dictionaryDetailSchema,
  )
}

export async function createDictionary(input: DictionaryCreateInput): Promise<DictionaryDetail> {
  return parseApiResponse(
    await api.system.dictionaries.$post({ json: input }),
    dictionaryDetailSchema,
  )
}

export async function updateDictionary(
  id: string,
  input: DictionaryUpdateInput,
): Promise<DictionaryDetail> {
  return parseApiResponse(
    await api.system.dictionaries[':id'].$put({
      param: { id },
      json: input,
    }),
    dictionaryDetailSchema,
  )
}

export async function deleteDictionary(id: string): Promise<void> {
  await assertApiResponseOk(await api.system.dictionaries[':id'].$delete({ param: { id } }))
}

export async function getDictionaryOptions(codes: string[]): Promise<DictionaryOptionsResponse> {
  return parseApiResponse(
    await api.system.dictionaries.options.$get({
      query: normalizeRequestQuery({ codes: codes.join(',') }) as { codes: string },
    }),
    dictionaryOptionsResponseSchema,
  )
}

export async function searchIcons(query: IconSearchQuery): Promise<IconSearchResponse> {
  return parseApiResponse(
    await api.icons.search.$get({
      query: normalizeRequestQuery(query),
    }),
    iconSearchResponseSchema,
  )
}
