import { hc } from 'hono/client'
import {
  AUTH_ACTION_HEADER,
  AUTH_ACTION_REFRESH,
  authTokenResponseSchema,
  type AuthTokenResponse,
} from '@rev30/contracts'
import type { AppType } from '@rev30/server'
import { useAuthStore } from './stores/auth'
import { ApiRequestError, parseApiResponse } from './utils/request'

function createSerialExecutor() {
  let tail = Promise.resolve()

  return function run<T>(operation: () => Promise<T>) {
    const result = tail.then(operation)

    tail = result.then(
      () => undefined,
      () => undefined,
    )

    return result
  }
}

function cloneFetchInput(input: RequestInfo | URL) {
  return input instanceof Request ? input.clone() : input
}

function createRequestHeaders(input: RequestInfo | URL, init: RequestInit) {
  const headers = new Headers(init.headers)

  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers.has(key)) {
        headers.set(key, value)
      }
    })
  }

  return headers
}

function setBearerToken(headers: Headers, accessToken: string) {
  headers.set('authorization', `Bearer ${accessToken}`)
}

function sendFetch(input: RequestInfo | URL, init: RequestInit = {}, headers?: Headers) {
  return fetch(cloneFetchInput(input), {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    ...(headers === undefined ? {} : { headers }),
  })
}

const internalApi = hc<AppType>('/api', {
  fetch: sendFetch,
})

const runSessionOperation = createSerialExecutor()
const autoRefreshes = new Map<string, Promise<AuthTokenResponse>>()

function runAuthSessionRefresh(accessToken: string | null) {
  return runSessionOperation(async () => {
    const response = await internalApi.auth.refresh.$post(
      undefined,
      accessToken === null ? undefined : { headers: { authorization: `Bearer ${accessToken}` } },
    )

    return parseApiResponse(response, authTokenResponseSchema)
  })
}

export function refreshAuthSession() {
  return runAuthSessionRefresh(useAuthStore().accessToken)
}

export async function logoutAuthSession(accessToken = useAuthStore().accessToken) {
  await runSessionOperation(() =>
    internalApi.auth.logout.$post(
      undefined,
      accessToken === null ? undefined : { headers: { authorization: `Bearer ${accessToken}` } },
    ),
  )
}

function getOrStartAutomaticRefresh(accessToken: string) {
  const pendingRefresh = autoRefreshes.get(accessToken)

  if (pendingRefresh !== undefined) {
    return pendingRefresh
  }

  const refresh = runAuthSessionRefresh(accessToken).finally(() => {
    autoRefreshes.delete(accessToken)
  })
  autoRefreshes.set(accessToken, refresh)

  return refresh
}

function clearSessionAndLogout(accessToken: string) {
  const auth = useAuthStore()

  if (auth.accessToken !== accessToken) {
    return
  }

  auth.clearSession()
  void logoutAuthSession(accessToken).catch(() => {})
}

function shouldRefreshAccessToken(response: Response) {
  return response.headers.get(AUTH_ACTION_HEADER) === AUTH_ACTION_REFRESH
}

async function resolveRetryAccessToken(accessToken: string) {
  const auth = useAuthStore()

  if (auth.accessToken !== accessToken) {
    return auth.accessToken
  }

  let refreshedSession: AuthTokenResponse

  try {
    refreshedSession = await getOrStartAutomaticRefresh(accessToken)
  } catch (error) {
    if (auth.accessToken !== accessToken) {
      return auth.accessToken
    }

    if (error instanceof ApiRequestError && error.status === 401) {
      clearSessionAndLogout(accessToken)
    }
    return null
  }

  if (auth.accessToken !== accessToken) {
    return auth.accessToken
  }

  auth.setSession(refreshedSession)

  return refreshedSession.accessToken
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const auth = useAuthStore()

  const headers = createRequestHeaders(input, init)
  const accessToken = auth.accessToken
  const requestAccessToken =
    accessToken !== null && !headers.has('authorization') ? accessToken : null

  if (requestAccessToken !== null) {
    setBearerToken(headers, requestAccessToken)
  }

  const response = await sendFetch(input, init, headers)

  if (response.status !== 401) {
    return response
  }

  if (requestAccessToken === null) {
    return response
  }

  if (!shouldRefreshAccessToken(response)) {
    clearSessionAndLogout(requestAccessToken)
    return response
  }

  const retryAccessToken = await resolveRetryAccessToken(requestAccessToken)

  if (retryAccessToken === null) {
    return response
  }

  const retryHeaders = new Headers(headers)
  setBearerToken(retryHeaders, retryAccessToken)

  const retryResponse = await sendFetch(input, init, retryHeaders)

  if (retryResponse.status === 401) {
    clearSessionAndLogout(retryAccessToken)
  }

  return retryResponse
}

export const api = hc<AppType>('/api', {
  fetch: authFetch,
})
