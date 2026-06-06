import {
  authTokenResponseSchema,
  type AuthLoginInput,
  type AuthTokenResponse,
  type AuthProfileUpdateInput,
  type AuthPasswordUpdateInput,
  type User,
  userSchema,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, parseApiResponse } from '../../utils/request'

export async function login(input: AuthLoginInput): Promise<AuthTokenResponse> {
  return parseApiResponse(await api.auth.login.$post({ json: input }), authTokenResponseSchema)
}

export async function refreshSession(): Promise<AuthTokenResponse> {
  return parseApiResponse(await api.auth.refresh.$post(), authTokenResponseSchema)
}

export async function logout(): Promise<void> {
  await api.auth.logout.$post()
}

export async function updateMyProfile(input: AuthProfileUpdateInput): Promise<User> {
  return parseApiResponse(await api.auth.me.profile.$patch({ json: input }), userSchema)
}

export async function updateMyPassword(input: AuthPasswordUpdateInput): Promise<void> {
  await assertApiResponseOk(await api.auth.me.password.$patch({ json: input }))
}
