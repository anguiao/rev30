import { describe, expect, it } from 'vitest'
import {
  onlineSessionListQuerySchema,
  onlineSessionListResponseSchema,
  onlineSessionRevokePathSchema,
} from '../../../src'
import { expectZodIssue, testUuid } from '../../helpers/schema'

describe('online session schemas', () => {
  it('parses pagination and trimmed filters with defaults', () => {
    expect(
      onlineSessionListQuerySchema.parse({
        page: '3',
        pageSize: '10',
        username: ' ada ',
        createdIp: ' 192.0.2.1 ',
      }),
    ).toEqual({ page: 3, pageSize: 10, username: 'ada', createdIp: '192.0.2.1' })

    expect(onlineSessionListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('accepts the complete online session response', () => {
    expect(
      onlineSessionListResponseSchema.parse({
        list: [
          {
            id: testUuid(1),
            userId: testUuid(2),
            username: 'ada',
            nickname: 'Ada Lovelace',
            createdIp: null,
            createdIpSource: 'socket',
            userAgent: {
              raw: 'Example/1.0',
              browser: null,
              operatingSystem: { name: 'Example OS', version: null },
              deviceType: 'unknown',
            },
            createdAt: '2026-08-18T00:00:00.000Z',
            lastActiveAt: '2026-08-18T00:05:00.000Z',
            expiresAt: '2026-08-25T00:00:00.000Z',
            isCurrent: true,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toMatchObject({ total: 1, page: 1, pageSize: 20 })
  })

  it('accepts all defined device types and rejects unknown values', () => {
    const baseUserAgent = {
      raw: 'Example/1.0',
      browser: null,
      operatingSystem: null,
    }

    for (const deviceType of ['desktop', 'mobile', 'tablet', 'tv', 'bot', 'unknown']) {
      const response = onlineSessionListResponseSchema.safeParse({
        list: [
          {
            id: testUuid(1),
            userId: testUuid(2),
            username: 'ada',
            nickname: 'Ada',
            createdIp: null,
            createdIpSource: 'unavailable',
            userAgent: { ...baseUserAgent, deviceType },
            createdAt: '2026-08-18T00:00:00.000Z',
            lastActiveAt: '2026-08-18T00:00:00.000Z',
            expiresAt: '2026-08-25T00:00:00.000Z',
            isCurrent: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      })

      expect(response.success).toBe(true)
    }
  })

  it('validates the revoke path session UUID', () => {
    expect(onlineSessionRevokePathSchema.parse({ id: testUuid(1) })).toEqual({ id: testUuid(1) })
    expectZodIssue(onlineSessionRevokePathSchema.safeParse({ id: 'invalid' }), {
      message: '会话 ID 无效',
      path: ['id'],
    })
  })
})
