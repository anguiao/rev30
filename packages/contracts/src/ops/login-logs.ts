import { z } from 'zod'
import { paginationQuerySchema, usernameInputSchema } from '../common'
import { optionalQueryValue } from '../query'
import { clientIpSourceSchema, opsUserAgentSchema } from './common'

export const loginLogResultSchema = z.enum(['success', 'failure'], '登录结果无效')
export const loginFailureReasonSchema = z.enum(
  ['invalid_credentials', 'account_disabled', 'rate_limited'],
  '登录失败原因无效',
)

const optionalTrimmedFilterSchema = optionalQueryValue(z.string().trim().min(1))
const optionalUsernameFilterSchema = optionalQueryValue(usernameInputSchema)
const occurredAtQuerySchema = optionalQueryValue(
  z.iso.datetime({ offset: true, error: '发生时间无效' }),
)

export const loginLogListQuerySchema = paginationQuerySchema
  .extend({
    username: optionalUsernameFilterSchema,
    result: optionalQueryValue(loginLogResultSchema),
    failureReason: optionalQueryValue(loginFailureReasonSchema),
    clientIp: optionalTrimmedFilterSchema,
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

const loginLogListItemBaseSchema = z.object({
  id: z.uuid('登录日志 ID 无效'),
  username: usernameInputSchema,
  requestId: z.uuid('请求 ID 无效'),
  clientIp: z.string().nullable(),
  clientIpSource: clientIpSourceSchema,
  userAgent: opsUserAgentSchema,
  createdAt: z.iso.datetime(),
})

export const loginLogListItemSchema = z.discriminatedUnion('result', [
  loginLogListItemBaseSchema.extend({
    userId: z.uuid('用户 ID 无效'),
    result: z.literal('success'),
    failureReason: z.null(),
    sessionId: z.uuid('会话 ID 无效'),
  }),
  loginLogListItemBaseSchema.extend({
    userId: z.uuid('用户 ID 无效').nullable(),
    result: z.literal('failure'),
    failureReason: loginFailureReasonSchema,
    sessionId: z.null(),
  }),
])

export const loginLogListResponseSchema = z.object({
  list: z.array(loginLogListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type LoginLogResult = z.infer<typeof loginLogResultSchema>
export type LoginFailureReason = z.infer<typeof loginFailureReasonSchema>
export type LoginLogListQuery = z.infer<typeof loginLogListQuerySchema>
export type LoginLogListItem = z.infer<typeof loginLogListItemSchema>
export type LoginLogListResponse = z.infer<typeof loginLogListResponseSchema>
