import { z } from 'zod'

export const USER_STATUS_DISABLED = 0
export const USER_STATUS_ENABLED = 1

export const systemUserStatusSchema = z.union([
  z.literal(USER_STATUS_DISABLED),
  z.literal(USER_STATUS_ENABLED),
])

const trimmedRequiredStringSchema = z.string().trim().min(1)

const nullableContactInputSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return null
  }

  return value
}, z.union([trimmedRequiredStringSchema, z.null()]).optional())

const optionalKeywordSchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined
  }

  return value
}, z.string().trim().optional())

const optionalStatusQuerySchema = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined
  }

  return value
}, z.coerce.number().pipe(systemUserStatusSchema).optional())

export const systemUserSchema = z.object({
  id: z.uuid(),
  username: trimmedRequiredStringSchema,
  nickname: trimmedRequiredStringSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: systemUserStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const systemUserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
})

export const systemUserCreateSchema = z.object({
  username: trimmedRequiredStringSchema,
  nickname: trimmedRequiredStringSchema,
  email: nullableContactInputSchema,
  phone: nullableContactInputSchema,
  status: systemUserStatusSchema.default(USER_STATUS_ENABLED),
})

export const systemUserUpdateSchema = z
  .object({
    username: trimmedRequiredStringSchema.optional(),
    nickname: trimmedRequiredStringSchema.optional(),
    email: nullableContactInputSchema,
    phone: nullableContactInputSchema,
    status: systemUserStatusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((fieldValue) => fieldValue !== undefined), {
    message: 'At least one field is required',
  })

export const systemUserListResponseSchema = z.object({
  list: z.array(systemUserSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type SystemUser = z.infer<typeof systemUserSchema>
export type SystemUserListQuery = z.infer<typeof systemUserListQuerySchema>
export type SystemUserCreateInput = z.infer<typeof systemUserCreateSchema>
export type SystemUserUpdateInput = z.infer<typeof systemUserUpdateSchema>
export type SystemUserListResponse = z.infer<typeof systemUserListResponseSchema>
export type SystemUserStatus = z.infer<typeof systemUserStatusSchema>
