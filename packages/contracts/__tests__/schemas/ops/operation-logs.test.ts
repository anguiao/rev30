import { describe, expect, it } from 'vitest'
import {
  operationLogActionSchema,
  operationLogDetailPathSchema,
  operationLogDetailSchema,
  operationLogListItemSchema,
  operationLogListQuerySchema,
  operationLogListResponseSchema,
  operationLogModuleSchema,
  operationLogResultSchema,
} from '../../../src'
import { expectZodIssue, testUuid } from '../../helpers/schema'

const listItem = {
  id: testUuid(1),
  actorUserId: testUuid(2),
  actorUsername: 'ada',
  actorNickname: 'Ada Lovelace',
  module: 'system',
  action: 'system:user:update',
  targetType: 'user',
  targetKey: testUuid(2),
  targetLabel: 'Ada Lovelace',
  result: 'success',
  httpStatus: 200,
  durationMs: 12,
  clientIp: '192.0.2.1',
  createdAt: '2026-08-18T00:00:00.000Z',
}

describe('operation log schemas', () => {
  it('accepts defined module, action and result values and rejects unknown values', () => {
    expect(operationLogModuleSchema.parse('system')).toBe('system')
    expect(operationLogModuleSchema.parse('content')).toBe('content')
    expect(operationLogModuleSchema.parse('ops')).toBe('ops')
    expect(operationLogActionSchema.parse('system:config:update')).toBe('system:config:update')
    expect(operationLogActionSchema.parse('content:icon-set:export')).toBe(
      'content:icon-set:export',
    )
    expect(operationLogActionSchema.parse('ops:online-session:revoke')).toBe(
      'ops:online-session:revoke',
    )
    for (const action of [
      'ops:scheduled-job:update',
      'ops:scheduled-job:enable',
      'ops:scheduled-job:disable',
      'ops:scheduled-job:execute',
      'ops:scheduled-job:cancel',
    ] as const) {
      expect(operationLogActionSchema.parse(action)).toBe(action)
    }
    expect(operationLogResultSchema.parse('success')).toBe('success')
    expect(operationLogResultSchema.parse('failure')).toBe('failure')

    expectZodIssue(operationLogModuleSchema.safeParse('auth'), {
      message: '操作日志模块无效',
    })
    expectZodIssue(operationLogActionSchema.safeParse('system:user:read'), {
      message: '操作日志动作无效',
    })
    expectZodIssue(operationLogResultSchema.safeParse('pending'), {
      message: '操作日志结果无效',
    })
  })

  it('parses every list filter with pagination defaults and normalization', () => {
    expect(
      operationLogListQuerySchema.parse({
        page: '2',
        pageSize: '50',
        actorKeyword: ' ada ',
        actorSessionId: ` ${testUuid(3)} `,
        module: 'system',
        action: 'system:user:update',
        result: 'success',
        httpStatus: '200',
        targetKeyword: ' Ada ',
        clientIp: ' 192.0.2.1 ',
        requestId: ` ${testUuid(4)} `,
        occurredFrom: '2026-08-18T08:00:00+08:00',
        occurredTo: '2026-08-18T09:00:00+08:00',
      }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      actorKeyword: 'ada',
      actorSessionId: testUuid(3),
      module: 'system',
      action: 'system:user:update',
      result: 'success',
      httpStatus: 200,
      targetKeyword: 'Ada',
      clientIp: '192.0.2.1',
      requestId: testUuid(4),
      occurredFrom: '2026-08-18T08:00:00+08:00',
      occurredTo: '2026-08-18T09:00:00+08:00',
    })

    expect(
      operationLogListQuerySchema.parse({
        actorKeyword: ' ',
        actorSessionId: '',
        module: ' ',
        action: '',
        result: ' ',
        httpStatus: '',
        targetKeyword: ' ',
        clientIp: '',
        requestId: ' ',
        occurredFrom: '',
        occurredTo: ' ',
      }),
    ).toEqual({ page: 1, pageSize: 20 })
  })

  it('rejects invalid pagination, identifiers, status and timezone-free timestamps', () => {
    expectZodIssue(operationLogListQuerySchema.safeParse({ page: '0' }), {
      message: '页码不能小于 1',
    })
    expectZodIssue(operationLogListQuerySchema.safeParse({ pageSize: '101' }), {
      message: '每页数量不能超过 100',
    })
    expectZodIssue(operationLogListQuerySchema.safeParse({ actorSessionId: 'invalid' }), {
      message: '会话 ID 无效',
      path: ['actorSessionId'],
    })
    expectZodIssue(operationLogListQuerySchema.safeParse({ requestId: 'invalid' }), {
      message: '请求 ID 无效',
      path: ['requestId'],
    })
    expectZodIssue(operationLogListQuerySchema.safeParse({ httpStatus: '99' }), {
      message: 'HTTP 状态码不能小于 100',
      path: ['httpStatus'],
    })
    expectZodIssue(operationLogListQuerySchema.safeParse({ httpStatus: '600' }), {
      message: 'HTTP 状态码不能超过 599',
      path: ['httpStatus'],
    })
    expectZodIssue(operationLogListQuerySchema.safeParse({ httpStatus: '200.5' }), {
      message: 'HTTP 状态码必须是整数',
      path: ['httpStatus'],
    })
    expectZodIssue(operationLogListQuerySchema.safeParse({ occurredFrom: '2026-08-18T08:00:00' }), {
      message: '发生时间无效',
      path: ['occurredFrom'],
    })
  })

  it('accepts equal occurrence boundaries and rejects inverted ranges', () => {
    const occurredAt = '2026-08-18T08:00:00+08:00'

    expect(
      operationLogListQuerySchema.safeParse({
        occurredFrom: occurredAt,
        occurredTo: occurredAt,
      }).success,
    ).toBe(true)
    expectZodIssue(
      operationLogListQuerySchema.safeParse({
        occurredFrom: '2026-08-18T09:00:00+08:00',
        occurredTo: '2026-08-18T08:00:00+08:00',
      }),
      { message: '开始时间不能晚于结束时间', path: ['occurredTo'] },
    )
  })

  it('parses exact list responses and rejects detail-only fields', () => {
    const response = operationLogListResponseSchema.parse({
      list: [listItem],
      total: 1,
      page: 1,
      pageSize: 20,
    })

    expect(response).toEqual({ list: [listItem], total: 1, page: 1, pageSize: 20 })
    expectZodIssue(
      operationLogListItemSchema.safeParse({ ...listItem, details: { secret: true } }),
      { message: 'Unrecognized key: "details"' },
    )
  })

  it('parses exact detail responses with user-agent structure', () => {
    const input = {
      ...listItem,
      actorIsAdmin: true,
      actorSessionId: testUuid(3),
      requestId: testUuid(4),
      clientIpSource: 'x-forwarded-for',
      userAgent: {
        raw: 'Example/1.0',
        browser: { name: 'Example', version: null },
        operatingSystem: null,
        deviceType: 'desktop',
      },
    }
    const detail = operationLogDetailSchema.parse(input)

    expect(detail).toMatchObject(input)
    expect(detail.userAgent).toEqual({
      raw: 'Example/1.0',
      browser: { name: 'Example', version: null },
      operatingSystem: null,
      deviceType: 'desktop',
    })
    expectZodIssue(
      operationLogDetailSchema.safeParse({ ...input, details: { password: 'secret' } }),
      { message: 'Unrecognized key: "details"' },
    )
  })

  it('rejects inconsistent operation-log response records', () => {
    expectZodIssue(operationLogListItemSchema.safeParse({ ...listItem, module: 'content' }), {
      message: '操作日志模块与动作不一致',
      path: ['module'],
    })
    expectZodIssue(operationLogListItemSchema.safeParse({ ...listItem, targetType: 'role' }), {
      message: '操作日志目标类型与动作不一致',
      path: ['targetType'],
    })
    expectZodIssue(
      operationLogListItemSchema.safeParse({
        ...listItem,
        targetKey: null,
        targetLabel: null,
      }),
      { message: '操作日志至少需要一个目标', path: ['targetKey'] },
    )
    expectZodIssue(operationLogListItemSchema.safeParse({ ...listItem, result: 'failure' }), {
      message: '操作日志结果与 HTTP 状态不一致',
      path: ['result'],
    })
  })

  it('counts bounded response fields by Unicode code points', () => {
    expect(
      operationLogListItemSchema.safeParse({
        ...listItem,
        actorNickname: '😀'.repeat(512),
      }).success,
    ).toBe(true)
    expectZodIssue(
      operationLogListItemSchema.safeParse({
        ...listItem,
        actorNickname: '😀'.repeat(513),
      }),
      { message: '操作日志字段不能超过 512 个字符', path: ['actorNickname'] },
    )
  })

  it('validates the detail path UUID', () => {
    expect(operationLogDetailPathSchema.parse({ id: testUuid(1) })).toEqual({ id: testUuid(1) })
    expectZodIssue(operationLogDetailPathSchema.safeParse({ id: 'invalid' }), {
      message: '操作日志 ID 无效',
      path: ['id'],
    })
  })
})
