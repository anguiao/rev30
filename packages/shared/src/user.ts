import { z } from 'zod'

export const USER_STATUS_DISABLED = 0
export const USER_STATUS_ENABLED = 1

export type UserUniqueField = 'username' | 'email' | 'phone'

export const userStatusSchema = z.literal([USER_STATUS_DISABLED, USER_STATUS_ENABLED])

const nonBlankStringSchema = z.string().trim().min(1)

function isBlankString(value: unknown) {
  return typeof value === 'string' && value.trim() === ''
}

const nullableContactInputSchema = z.preprocess(
  (value) => (isBlankString(value) ? null : value),
  z.union([nonBlankStringSchema, z.null()]).optional(),
)

const optionalKeywordSchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  z.string().trim().optional(),
)

const optionalStatusQuerySchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  z.coerce.number().pipe(userStatusSchema).optional(),
)

export const userSchema = z.object({
  id: z.uuid(),
  username: nonBlankStringSchema,
  nickname: nonBlankStringSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
})

export const userCreateSchema = z.object({
  username: nonBlankStringSchema,
  nickname: nonBlankStringSchema,
  email: nullableContactInputSchema,
  phone: nullableContactInputSchema,
  status: userStatusSchema.default(USER_STATUS_ENABLED),
})

export const userUpdateSchema = z
  .object({
    username: nonBlankStringSchema.optional(),
    nickname: nonBlankStringSchema.optional(),
    email: nullableContactInputSchema,
    phone: nullableContactInputSchema,
    status: userStatusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((fieldValue) => fieldValue !== undefined), {
    message: 'At least one field is required',
  })

export const userListResponseSchema = z.object({
  list: z.array(userSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type User = z.infer<typeof userSchema>
export type UserListQuery = z.infer<typeof userListQuerySchema>
export type UserCreateInput = z.infer<typeof userCreateSchema>
export type UserUpdateInput = z.infer<typeof userUpdateSchema>
export type UserListResponse = z.infer<typeof userListResponseSchema>
export type UserStatus = z.infer<typeof userStatusSchema>
