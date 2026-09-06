import {
  roleSchema,
  type Role,
  type RoleCreateInput,
  type RoleUpdateInput,
  roleListResponseSchema,
  type RoleListQuery,
  type RoleListResponse,
  roleOptionsResponseSchema,
  type RoleOptionsResponse,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

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
