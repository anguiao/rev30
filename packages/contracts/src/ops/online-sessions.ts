import { z } from 'zod'
import { nonBlankString, paginationQuerySchema, usernameInputSchema } from '../common'
import { optionalQueryValue } from '../query'
import { clientIpSourceSchema, opsUserAgentSchema } from './common'

const optionalTrimmedFilterSchema = optionalQueryValue(z.string().trim().min(1))

export const onlineSessionListQuerySchema = paginationQuerySchema.extend({
  username: optionalQueryValue(usernameInputSchema),
  createdIp: optionalTrimmedFilterSchema,
})

export const onlineSessionListItemSchema = z.object({
  id: z.uuid('会话 ID 无效'),
  userId: z.uuid('用户 ID 无效'),
  username: usernameInputSchema,
  nickname: nonBlankString(),
  createdIp: z.string().nullable(),
  createdIpSource: clientIpSourceSchema,
  userAgent: opsUserAgentSchema,
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  isCurrent: z.boolean(),
})

export const onlineSessionListResponseSchema = z.object({
  list: z.array(onlineSessionListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const onlineSessionRevokePathSchema = z.object({
  id: z.uuid('会话 ID 无效'),
})

export type OnlineSessionListQuery = z.infer<typeof onlineSessionListQuerySchema>
export type OnlineSessionListItem = z.infer<typeof onlineSessionListItemSchema>
export type OnlineSessionListResponse = z.infer<typeof onlineSessionListResponseSchema>
export type OnlineSessionRevokePath = z.infer<typeof onlineSessionRevokePathSchema>
