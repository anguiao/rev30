import { hc } from 'hono/client'
import { AUTH_ACTION_HEADER, AUTH_ACTION_REFRESH, authTokenResponseSchema } from '@rev30/shared'
import type { AppType } from '@rev30/server'
import type { AuthTokenResponse } from '@rev30/shared'
import { useAuthStore } from './stores/auth'

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

function sendFetch(input: RequestInfo | URL, init: RequestInit = {}, headers?: Headers) {
  return fetch(cloneFetchInput(input), {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    ...(headers === undefined ? {} : { headers }),
  })
}

function setBearerToken(headers: Headers, accessToken: string) {
  headers.set('authorization', `Bearer ${accessToken}`)
}

const internalApi = hc<AppType>('/api', {
  fetch: sendFetch,
})

let refreshedSessionPromise: Promise<AuthTokenResponse | null> | null = null

async function requestRefreshedSession() {
  try {
    const response = await internalApi.auth.refresh.$post()

    if (!response.ok) {
      return null
    }

    return authTokenResponseSchema.parse(await response.json())
  } catch {
    return null
  } finally {
    refreshedSessionPromise = null
  }
}

function getRefreshedSession() {
  refreshedSessionPromise ??= requestRefreshedSession()

  return refreshedSessionPromise
}

function clearSessionAndLogout() {
  const auth = useAuthStore()

  auth.clearSession()
  void internalApi.auth.logout.$post().catch(() => {})
}

function clearSessionAndLogoutIfCurrent(accessToken: string) {
  const auth = useAuthStore()

  if (auth.accessToken === accessToken) {
    clearSessionAndLogout()
  }
}

function shouldRefreshAccessToken(response: Response) {
  return response.headers.get(AUTH_ACTION_HEADER) === AUTH_ACTION_REFRESH
}

async function resolveRetryAccessToken(accessToken: string) {
  const auth = useAuthStore()

  if (auth.accessToken !== accessToken) {
    return auth.accessToken
  }

  const refreshedSession = await getRefreshedSession()

  if (auth.accessToken !== accessToken) {
    return auth.accessToken
  }

  if (refreshedSession === null) {
    clearSessionAndLogout()

    return null
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
    clearSessionAndLogoutIfCurrent(requestAccessToken)
    return response
  }

  const retryAccessToken = await resolveRetryAccessToken(requestAccessToken)

  if (retryAccessToken === null) {
    return response
  }

  const retryHeaders = new Headers(headers)
  setBearerToken(retryHeaders, retryAccessToken)

  const retryResponse = await sendFetch(input, init, retryHeaders)

  if (retryResponse.status === 401 && auth.accessToken === retryAccessToken) {
    clearSessionAndLogout()
  }

  return retryResponse
}

export const api = hc<AppType>('/api', {
  fetch: authFetch,
})
