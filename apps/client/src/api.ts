import { hc } from 'hono/client'
import type { AppType } from '@rev30/server'
import { useAuthStore } from './stores/auth'

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const auth = useAuthStore()
  const headers = new Headers(init.headers)

  if (auth.accessToken !== null && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${auth.accessToken}`)
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers,
  })
}

export const api = hc<AppType>('/api', {
  fetch: authFetch,
})
