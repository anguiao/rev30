import { expect } from 'vitest'

export function jsonRequest(body: unknown, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('content-type', headers.get('content-type') ?? 'application/json')

  return {
    ...init,
    body: JSON.stringify(body),
    headers,
  }
}

export async function responseJson<T>(response: Response) {
  return (await response.json()) as T
}

export async function expectJsonResponse(
  response: Response,
  expected: {
    body?: unknown
    status: number
  },
) {
  expect(response.status).toBe(expected.status)

  if ('body' in expected) {
    expect(await response.json()).toEqual(expected.body)
  }
}
