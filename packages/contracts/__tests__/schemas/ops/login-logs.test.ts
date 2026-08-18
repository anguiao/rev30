import { describe, expect, it } from 'vitest'
import {
  loginLogListQuerySchema,
  loginLogListResponseSchema,
  loginLogResultSchema,
  loginFailureReasonSchema,
} from '../../../src'
import { expectZodIssue, testUuid } from '../../helpers/schema'

describe('login log schemas', () => {
  it('parses pagination and trimmed filters with defaults', () => {
    expect(
      loginLogListQuerySchema.parse({
        page: '2',
        pageSize: '50',
        username: ' ada ',
        result: 'failure',
        failureReason: 'invalid_credentials',
        clientIp: ' 192.0.2.1 ',
        occurredFrom: '2026-08-18T08:00:00+08:00',
        occurredTo: '2026-08-18T09:00:00+08:00',
      }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      username: 'ada',
      result: 'failure',
      failureReason: 'invalid_credentials',
      clientIp: '192.0.2.1',
      occurredFrom: '2026-08-18T08:00:00+08:00',
      occurredTo: '2026-08-18T09:00:00+08:00',
    })

    expect(loginLogListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('accepts the defined result and failure reason values', () => {
    expect(loginLogResultSchema.parse('success')).toBe('success')
    expect(loginLogResultSchema.parse('failure')).toBe('failure')
    expect(loginFailureReasonSchema.parse('invalid_credentials')).toBe('invalid_credentials')
    expect(loginFailureReasonSchema.parse('account_disabled')).toBe('account_disabled')
    expect(loginFailureReasonSchema.parse('rate_limited')).toBe('rate_limited')
  })

  it('rejects pagination outside the shared boundaries', () => {
    expectZodIssue(loginLogListQuerySchema.safeParse({ page: '0' }), {
      message: '页码不能小于 1',
    })
    expectZodIssue(loginLogListQuerySchema.safeParse({ pageSize: '101' }), {
      message: '每页数量不能超过 100',
    })
  })

  it('requires timezone-aware ISO time filters', () => {
    expectZodIssue(loginLogListQuerySchema.safeParse({ occurredFrom: '2026-08-18T08:00:00' }), {
      message: '发生时间无效',
      path: ['occurredFrom'],
    })
  })

  it('rejects an inverted occurrence time range', () => {
    expectZodIssue(
      loginLogListQuerySchema.safeParse({
        occurredFrom: '2026-08-18T09:00:00+08:00',
        occurredTo: '2026-08-18T08:00:00+08:00',
      }),
      { message: '开始时间不能晚于结束时间', path: ['occurredTo'] },
    )
  })

  it('accepts paginated response items with nullable user agent fields', () => {
    const id = testUuid(1)
    const userId = testUuid(2)
    const sessionId = testUuid(3)
    const requestId = testUuid(4)

    expect(
      loginLogListResponseSchema.parse({
        list: [
          {
            id,
            userId,
            username: 'ada',
            result: 'success',
            failureReason: null,
            sessionId,
            requestId,
            clientIp: '192.0.2.1',
            clientIpSource: 'x-forwarded-for',
            userAgent: {
              raw: 'Example/1.0',
              browser: { name: 'Example', version: null },
              operatingSystem: null,
              deviceType: 'desktop',
            },
            createdAt: '2026-08-18T00:00:00.000Z',
          },
          {
            id: testUuid(5),
            userId: null,
            username: 'unknown',
            result: 'failure',
            failureReason: 'invalid_credentials',
            sessionId: null,
            requestId: testUuid(6),
            clientIp: null,
            clientIpSource: 'unavailable',
            userAgent: null,
            createdAt: '2026-08-17T00:00:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({ total: 2, page: 1, pageSize: 20 })
  })

  it('rejects unknown device types in responses', () => {
    const result = loginLogListResponseSchema.safeParse({
      list: [
        {
          id: testUuid(1),
          userId: null,
          username: 'ada',
          result: 'failure',
          failureReason: 'rate_limited',
          sessionId: null,
          requestId: testUuid(2),
          clientIp: null,
          clientIpSource: 'socket',
          userAgent: {
            raw: 'Example/1.0',
            browser: null,
            operatingSystem: null,
            deviceType: 'console',
          },
          createdAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })

    expectZodIssue(result, { message: '设备类型无效' })
  })
})
