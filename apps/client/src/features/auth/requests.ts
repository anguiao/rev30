import {
  authErrorResponseSchema,
  authTokenResponseSchema,
  type AuthErrorResponse,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthTokenResponse,
} from '@rev30/shared'
import { api } from '../../api'

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

async function parseAuthResponse(response: Response): Promise<AuthTokenResponse> {
  if (!response.ok) {
    throw await parseAuthError(response)
  }

  return parseAuthSession(response)
}

export async function login(input: AuthLoginInput): Promise<AuthTokenResponse> {
  return parseAuthResponse(await api.auth.login.$post({ json: input }))
}

export async function register(input: AuthRegisterInput): Promise<AuthTokenResponse> {
  return parseAuthResponse(await api.auth.register.$post({ json: input }))
}

export async function refreshSession(): Promise<AuthTokenResponse> {
  return parseAuthResponse(await api.auth.refresh.$post())
}

export async function logout(): Promise<void> {
  await api.auth.logout.$post()
}
