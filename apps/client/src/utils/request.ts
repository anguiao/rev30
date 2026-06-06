import { errorResponseSchema, type ErrorResponse } from '@rev30/contracts'
import type { z } from 'zod'

type RequestQueryValue = string | number | boolean | undefined

export function normalizeRequestQuery<T extends Record<string, RequestQueryValue>>(query: T) {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ) as Partial<Record<keyof T, string>>
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: ErrorResponse['field'],
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export async function parseApiError(response: Response): Promise<ApiRequestError> {
  try {
    const result = errorResponseSchema.safeParse(await response.json())

    return new ApiRequestError(
      response.status,
      result.success ? result.data.message : '请求失败',
      result.success ? result.data.field : undefined,
    )
  } catch {
    return new ApiRequestError(response.status, '请求失败')
  }
}

export async function assertApiResponseOk(response: Response) {
  if (!response.ok) {
    throw await parseApiError(response)
  }
}

export async function parseApiResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  await assertApiResponseOk(response)

  return schema.parse(await response.json())
}
