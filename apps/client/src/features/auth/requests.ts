import {
  authErrorResponseSchema,
  authPasswordUpdateSchema,
  authTokenResponseSchema,
  authProfileUpdateSchema,
  type AuthErrorResponse,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthTokenResponse,
  type AuthProfileUpdateInput,
  type AuthPasswordUpdateInput,
  type User,
  userSchema,
} from '@rev30/shared'
import { api } from '../../api'
import type { ZodType } from 'zod'

export class AuthRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: AuthErrorResponse['field'],
  ) {
    super(message)
    this.name = 'AuthRequestError'
  }
}

export async function parseAuthSession(response: Response): Promise<AuthTokenResponse> {
  return authTokenResponseSchema.parse(await response.json())
}

export async function parseAuthError(response: Response): Promise<AuthRequestError> {
  try {
    const result = authErrorResponseSchema.safeParse(await response.json())

    return result.success
      ? new AuthRequestError(response.status, result.data.message, result.data.field)
      : new AuthRequestError(response.status, '请求失败')
  } catch {
    return new AuthRequestError(response.status, '请求失败')
  }
}

async function parseAuthResponse<T>(response: Response, schema: ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await parseAuthError(response)
  }

  return schema.parse(await response.json())
}

export async function login(input: AuthLoginInput): Promise<AuthTokenResponse> {
  return parseAuthResponse(await api.auth.login.$post({ json: input }), authTokenResponseSchema)
}

export async function register(input: AuthRegisterInput): Promise<AuthTokenResponse> {
  return parseAuthResponse(await api.auth.register.$post({ json: input }), authTokenResponseSchema)
}

export async function refreshSession(): Promise<AuthTokenResponse> {
  return parseAuthResponse(await api.auth.refresh.$post(), authTokenResponseSchema)
}

export async function logout(): Promise<void> {
  await api.auth.logout.$post()
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  return error instanceof AuthRequestError ? error.message : fallback
}

export async function updateMyProfile(input: AuthProfileUpdateInput): Promise<User> {
  const response = await api.auth.me.profile.$patch({ json: authProfileUpdateSchema.parse(input) })

  return parseAuthResponse(response, userSchema)
}

export async function updateMyPassword(input: AuthPasswordUpdateInput): Promise<void> {
  const response = await api.auth.me.password.$patch({
    json: authPasswordUpdateSchema.parse(input),
  })

  if (!response.ok) {
    throw await parseAuthError(response)
  }
}
