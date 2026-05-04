import { z } from 'zod'
import { blankStringToNull, blankStringToUndefined } from '../utils'
import { departmentSummarySchema } from './departments'
import { roleIdsSchema, roleSummarySchema } from './roles'

export const USER_STATUS_DISABLED = 0
export const USER_STATUS_ENABLED = 1
export const userStatusSchema = z.literal(
  [USER_STATUS_DISABLED, USER_STATUS_ENABLED],
  '用户状态无效',
)

const userUniqueFields = ['username', 'email', 'phone'] as const
export type UserUniqueField = (typeof userUniqueFields)[number]
export const userUniqueFieldSchema = z.enum(userUniqueFields)

const nonBlankStringSchema = z.string().trim().min(1, '不能为空')

const userIdSchema = z.uuid('用户 ID 无效')
const userNameSchema = z.string().trim().min(1, '请输入用户名')
const userNicknameSchema = z.string().trim().min(1, '请输入昵称')
export const nullableContactInputSchema = z.preprocess(
  blankStringToNull,
  z.union([nonBlankStringSchema, z.null()]).optional(),
)

const optionalKeywordSchema = z.preprocess(
  blankStringToUndefined,
  z.string().trim().optional(),
)

const optionalStatusQuerySchema = z.preprocess(
  blankStringToUndefined,
  z.coerce.number().pipe(userStatusSchema).optional(),
)

const pageSchema = z.coerce.number('页码必须是数字').int('页码必须是整数').min(1, '页码不能小于 1')
const pageSizeSchema = z.coerce
  .number('每页数量必须是数字')
  .int('每页数量必须是整数')
  .min(1, '每页数量不能小于 1')
  .max(100, '每页数量不能超过 100')

export const userSchema = z.object({
  id: userIdSchema,
  username: nonBlankStringSchema,
  nickname: nonBlankStringSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  departments: z.array(departmentSummarySchema),
  roles: z.array(roleSummarySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const userDepartmentSchema = departmentSummarySchema
export const userRoleSchema = roleSummarySchema

export const departmentIdsSchema = z.array(z.uuid('部门 ID 无效')).superRefine((value, context) => {
  const seenDepartmentIds = new Set<string>()

  for (const departmentId of value) {
    if (seenDepartmentIds.has(departmentId)) {
      context.addIssue({
        code: 'custom',
        message: '部门不能重复',
      })
      return
    }

    seenDepartmentIds.add(departmentId)
  }
})

export const userListQuerySchema = z.object({
  page: pageSchema.default(1),
  pageSize: pageSizeSchema.default(20),
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
})

export const userCreateSchema = z.object({
  username: userNameSchema,
  nickname: userNicknameSchema,
  email: nullableContactInputSchema,
  phone: nullableContactInputSchema,
  status: userStatusSchema.default(USER_STATUS_ENABLED),
  departmentIds: departmentIdsSchema.optional(),
  roleIds: roleIdsSchema.optional(),
})

export const userUpdateSchema = z
  .object({
    username: userNameSchema.optional(),
    nickname: userNicknameSchema.optional(),
    email: nullableContactInputSchema,
    phone: nullableContactInputSchema,
    status: userStatusSchema.optional(),
    departmentIds: departmentIdsSchema.optional(),
    roleIds: roleIdsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((fieldValue) => fieldValue !== undefined), {
    message: '至少修改一个字段',
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
