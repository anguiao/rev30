import {
  authErrorResponseSchema,
  authLoginSchema,
  authRegisterSchema,
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
      : new AuthRequestError(response.status, 'Request failed')
  } catch {
    return new AuthRequestError(response.status, 'Request failed')
  }
}

async function parseAuthResponse(response: Response) {
  if (!response.ok) {
    throw await parseAuthError(response)
  }

  return parseAuthSession(response)
}

export async function login(input: AuthLoginInput) {
  return parseAuthResponse(await api.auth.login.$post({ json: authLoginSchema.parse(input) }))
}

export async function register(input: AuthRegisterInput) {
  return parseAuthResponse(await api.auth.register.$post({ json: authRegisterSchema.parse(input) }))
}

export async function refreshSession() {
  return parseAuthResponse(await api.auth.refresh.$post())
}

export async function logout() {
  const response = await api.auth.logout.$post()
  const status: number = response.status

  if (!response.ok && status !== 401 && status !== 400) {
    throw await parseAuthError(response)
  }
}
