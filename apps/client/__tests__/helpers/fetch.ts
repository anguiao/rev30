import { expect, vi } from 'vitest'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function toRequestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

export function emptyResponse(status = 204) {
  return new Response(null, { status })
}

export function createFetchMock(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()

  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response)
  })

  if (responses.length === 1) {
    fetchMock.mockResolvedValue(responses[0]!)
  }

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

export function getFetchCall(fetchMock: FetchMock, index = 0) {
  const call = fetchMock.mock.calls[index]

  expect(call).toBeDefined()

  const [input, init = {}] = call!

  return {
    headers: new Headers(init.headers),
    init,
    input,
    url: toRequestUrl(input),
  }
}

export function expectFetchCall(
  fetchMock: FetchMock,
  index: number,
  expected: {
    method?: string
    pathname?: string
    query?: Record<string, string | undefined>
  },
) {
  const call = getFetchCall(fetchMock, index)
  const url = new URL(call.url, 'http://localhost')

  if (expected.pathname !== undefined) {
    expect(url.pathname).toBe(expected.pathname)
  }

  if (expected.method !== undefined) {
    expect(call.init.method).toBe(expected.method)
  }

  Object.entries(expected.query ?? {}).forEach(([key, value]) => {
    if (value === undefined) {
      expect(url.searchParams.has(key)).toBe(false)
      return
    }

    expect(url.searchParams.get(key)).toBe(value)
  })

  return call
}

export function expectJsonBody(fetchMock: FetchMock, index: number, expected: unknown) {
  const call = getFetchCall(fetchMock, index)

  expect(call.init.body).toEqual(expect.any(String))
  expect(JSON.parse(call.init.body as string)).toEqual(expected)
}
