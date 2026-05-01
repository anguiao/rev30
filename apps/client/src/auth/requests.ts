import {
  authTokenResponseSchema,
  type AuthErrorResponse,
  type AuthLoginInput,
  type AuthRegisterInput,
  type AuthTokenResponse,
  type UserUniqueField,
} from '@rev30/shared'
import { api } from '../api'

type AuthErrorBody = AuthErrorResponse & {
  field?: unknown
}

const userUniqueFields = new Set<UserUniqueField>(['username', 'email', 'phone'])

function parseAuthErrorField(field: unknown): UserUniqueField | undefined {
  return typeof field === 'string' && userUniqueFields.has(field as UserUniqueField)
    ? (field as UserUniqueField)
    : undefined
}

export class AuthRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: UserUniqueField,
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
    const body = (await response.json()) as Partial<AuthErrorBody>

    return new AuthRequestError(
      response.status,
      typeof body.message === 'string' ? body.message : 'Request failed',
      parseAuthErrorField(body.field),
    )
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

function normalizeContact(value: string | null | undefined) {
  return value === undefined || value === null || value.trim() === '' ? null : value
}

export async function login(input: AuthLoginInput) {
  return parseAuthResponse(await api.auth.login.$post({ json: input }))
}

export async function register(input: AuthRegisterInput) {
  return parseAuthResponse(
    await api.auth.register.$post({
      json: {
        ...input,
        email: normalizeContact(input.email),
        phone: normalizeContact(input.phone),
      },
    }),
  )
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
