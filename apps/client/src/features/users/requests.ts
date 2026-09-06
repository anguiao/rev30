import {
  type User,
  type UserListQuery,
  type UserListResponse,
  type UserCreateInput,
  type UserCreateResponse,
  type UserResetPasswordResponse,
  userOptionsResponseSchema,
  type UserOptionsResponse,
  type UserUpdateInput,
  userCreateResponseSchema,
  userSchema,
  userListResponseSchema,
  userResetPasswordResponseSchema,
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
