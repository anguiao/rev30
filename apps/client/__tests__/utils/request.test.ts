import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ApiRequestError,
  assertApiResponseOk,
  normalizeRequestQuery,
  parseApiError,
  parseApiResponse,
} from '../../src/utils/request'

describe('request utils', () => {
  it('normalizes query values while omitting empty filters', () => {
    expect(
      normalizeRequestQuery({
        empty: '',
        disabled: false,
        missing: undefined,
        page: 0,
        keyword: 'ada',
      }),
    ).toEqual({
      disabled: 'false',
      page: '0',
      keyword: 'ada',
    })
  })

  it('exposes response metadata on typed request errors', () => {
    const error = new ApiRequestError(409, '用户名已存在', 'username')

    expect(error).toMatchObject({
      name: 'ApiRequestError',
      status: 409,
      message: '用户名已存在',
      field: 'username',
    })
  })

  it('parses structured API errors', async () => {
    await expect(
      parseApiError(
        new Response(JSON.stringify({ field: 'username', message: '用户名已存在' }), {
          status: 409,
        }),
      ),
    ).resolves.toMatchObject({
      status: 409,
      field: 'username',
      message: '用户名已存在',
    })
  })

  it.each([
    ['invalid error payload', JSON.stringify({ field: 123, message: 123 })],
    ['non-JSON response', 'internal server error'],
  ])('uses a stable fallback for %s', async (_label, body) => {
    await expect(parseApiError(new Response(body, { status: 500 }))).resolves.toMatchObject({
      status: 500,
      message: '请求失败',
      field: undefined,
    })
  })

  it('accepts successful empty responses and rejects failed ones', async () => {
    await expect(assertApiResponseOk(new Response(null, { status: 204 }))).resolves.toBeUndefined()
    await expect(
      assertApiResponseOk(
        new Response(JSON.stringify({ message: '无权访问' }), {
          status: 403,
        }),
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: '无权访问',
    })
  })

  it('parses successful JSON responses with the provided schema', async () => {
    const schema = z.object({ id: z.uuid(), name: z.string() })

    await expect(
      parseApiResponse(
        new Response(
          JSON.stringify({
            id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
            name: 'Ada',
          }),
        ),
        schema,
      ),
    ).resolves.toEqual({
      id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
      name: 'Ada',
    })
  })
})
