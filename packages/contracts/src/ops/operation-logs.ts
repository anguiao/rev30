import { z } from 'zod'
import { nonBlankString, paginationQuerySchema } from '../common'
import { optionalNumericQueryValue, optionalQueryValue } from '../query'
import { clientIpSourceSchema, opsUserAgentSchema } from './common'

export const operationLogModuleSchema = z.enum(['system', 'content', 'ops'], '操作日志模块无效')

export const operationLogActionSchema = z.enum(
  [
    'system:config:update',
    'system:dictionary:create',
    'system:dictionary:update',
    'system:dictionary:delete',
    'system:department:create',
    'system:department:update',
    'system:department:delete',
    'system:role:create',
    'system:role:update',
    'system:role:delete',
    'system:resource:create',
    'system:resource:update',
    'system:resource:delete',
    'system:user:create',
    'system:user:update',
    'system:user:reset-password',
    'system:user:delete',
    'content:announcement:create',
    'content:announcement:update',
    'content:announcement:publish',
    'content:announcement:archive',
    'content:announcement:delete',
    'content:icon-set:create',
    'content:icon-set:update',
    'content:icon-set:delete',
    'content:icon-set:export',
    'content:icon:upload',
    'content:icon:rename',
    'content:icon:delete',
    'content:attachment:upload',
    'content:attachment:delete',
    'ops:online-session:revoke',
  ],
  '操作日志动作无效',
)

export const operationLogResultSchema = z.enum(['success', 'failure'], '操作日志结果无效')

const optionalTrimmedFilterSchema = optionalQueryValue(z.string().trim().min(1))
const occurredAtQuerySchema = optionalQueryValue(
  z.iso.datetime({ offset: true, error: '发生时间无效' }),
)
const httpStatusSchema = z
  .number('HTTP 状态码必须是数字')
  .int('HTTP 状态码必须是整数')
  .min(100, 'HTTP 状态码不能小于 100')
  .max(599, 'HTTP 状态码不能超过 599')

export const operationLogListQuerySchema = paginationQuerySchema
  .extend({
    actorKeyword: optionalTrimmedFilterSchema,
    actorSessionId: optionalQueryValue(z.uuid('会话 ID 无效')),
    module: optionalQueryValue(operationLogModuleSchema),
    action: optionalQueryValue(operationLogActionSchema),
    result: optionalQueryValue(operationLogResultSchema),
    httpStatus: optionalNumericQueryValue(httpStatusSchema),
    targetKeyword: optionalTrimmedFilterSchema,
    clientIp: optionalTrimmedFilterSchema,
    requestId: optionalQueryValue(z.uuid('请求 ID 无效')),
    occurredFrom: occurredAtQuerySchema,
    occurredTo: occurredAtQuerySchema,
  })
  .refine(
    ({ occurredFrom, occurredTo }) =>
      occurredFrom === undefined ||
      occurredTo === undefined ||
      Date.parse(occurredFrom) <= Date.parse(occurredTo),
    {
      message: '开始时间不能晚于结束时间',
      path: ['occurredTo'],
    },
  )

const operationLogSnapshotStringSchema = nonBlankString().max(512)
const operationLogTargetValueSchema = operationLogSnapshotStringSchema.nullable()

export const operationLogListItemSchema = z.object({
  id: z.uuid('操作日志 ID 无效'),
  actorUserId: z.uuid('用户 ID 无效'),
  actorUsername: operationLogSnapshotStringSchema,
  actorNickname: operationLogSnapshotStringSchema,
  module: operationLogModuleSchema,
  action: operationLogActionSchema,
  targetType: operationLogSnapshotStringSchema,
  targetKey: operationLogTargetValueSchema,
  targetLabel: operationLogTargetValueSchema,
  result: operationLogResultSchema,
  httpStatus: httpStatusSchema,
  durationMs: z.number().int().min(0),
  clientIp: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export const operationLogListResponseSchema = z.object({
  list: z.array(operationLogListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const operationLogDetailSchema = operationLogListItemSchema.extend({
  actorIsAdmin: z.boolean(),
  actorSessionId: z.uuid('会话 ID 无效'),
  requestId: z.uuid('请求 ID 无效'),
  clientIpSource: clientIpSourceSchema,
  userAgent: opsUserAgentSchema,
})

export const operationLogDetailPathSchema = z.object({
  id: z.uuid('操作日志 ID 无效'),
})

export type OperationLogModule = z.infer<typeof operationLogModuleSchema>
export type OperationLogAction = z.infer<typeof operationLogActionSchema>
export type OperationLogResult = z.infer<typeof operationLogResultSchema>
export type OperationLogListQuery = z.infer<typeof operationLogListQuerySchema>
export type OperationLogListItem = z.infer<typeof operationLogListItemSchema>
export type OperationLogListResponse = z.infer<typeof operationLogListResponseSchema>
export type OperationLogDetail = z.infer<typeof operationLogDetailSchema>
export type OperationLogDetailPath = z.infer<typeof operationLogDetailPathSchema>
