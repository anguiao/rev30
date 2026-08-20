import { describe, expect, it, vi } from 'vitest'
import type { Db } from '../../../../src/db'
import { opsOperationLogs } from '../../../../src/db/schema'
import { createOperationAuditWriter } from '../../../../src/modules/ops/operation-logs/writer'
import type { OperationAuditEvent } from '../../../../src/modules/ops/operation-logs/types'

describe('operation audit writer', () => {
  it('performs one insert with the event fields', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    const insert = vi.fn(() => ({ values }))
    const writer = createOperationAuditWriter({ insert } as unknown as Db)
    const event: OperationAuditEvent = Object.freeze({
      actorUserId: '10000000-0000-4000-8000-000000000001',
      actorUsername: 'ada',
      actorNickname: 'Ada',
      actorIsAdmin: false,
      actorSessionId: '10000000-0000-4000-8000-000000000002',
      module: 'system',
      action: 'system:user:update',
      targetType: 'user',
      targetKey: 'user-1',
      targetLabel: null,
      result: 'success',
      httpStatus: 200,
      durationMs: 5,
      requestId: '10000000-0000-4000-8000-000000000003',
      clientIp: null,
      clientIpSource: 'unavailable',
      userAgent: null,
      createdAt: '2026-08-19T00:00:00.000Z',
    })

    await writer(event)

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(opsOperationLogs)
    expect(values).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith({
      ...event,
      createdAt: new Date('2026-08-19T00:00:00.000Z'),
    })
  })
})
