import { z } from 'zod'
import { nonBlankString, optionalNullableString } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { ensureUniqueItems, hasAnyDefinedValue } from '../common/refinements'
import { optionalNumericQueryValue, optionalTrimmedQueryString } from '../query'
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

const userIdSchema = z.uuid('用户 ID 无效')
const userNameSchema = nonBlankString('请输入用户名')
const userNicknameSchema = nonBlankString('请输入昵称')
export const contactInputSchema = optionalNullableString()

const optionalKeywordSchema = optionalTrimmedQueryString()
const optionalStatusQuerySchema = optionalNumericQueryValue(userStatusSchema)

export const userSchema = z.object({
  id: userIdSchema,
  username: nonBlankString(),
  nickname: nonBlankString(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  builtIn: z.boolean(),
  departments: z.array(departmentSummarySchema),
  roles: z.array(roleSummarySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const userListItemSchema = userSchema

export const userDepartmentSchema = departmentSummarySchema
export const userRoleSchema = roleSummarySchema

const departmentIdsMaxLength = 50
export const departmentIdsSchema = z
  .array(z.uuid('部门 ID 无效'))
  .max(departmentIdsMaxLength, `用户部门不能超过 ${departmentIdsMaxLength} 个`)
  .superRefine(ensureUniqueItems('部门不能重复'))

export const userListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
})

export const userFormSchema = z.object({
  username: userNameSchema,
  nickname: userNicknameSchema,
  email: contactInputSchema,
  phone: contactInputSchema,
  status: userStatusSchema,
  departmentIds: departmentIdsSchema,
  roleIds: roleIdsSchema,
})

export const userCreateSchema = userFormSchema.extend({
  status: userStatusSchema.default(USER_STATUS_ENABLED),
  departmentIds: departmentIdsSchema.optional(),
  roleIds: roleIdsSchema.optional(),
})

export const userUpdateSchema = userFormSchema.partial().refine(hasAnyDefinedValue, {
  message: '至少修改一个字段',
})

export const userListResponseSchema = z.object({
  list: z.array(userListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type User = z.infer<typeof userSchema>
export type UserListItem = z.infer<typeof userListItemSchema>
export type UserListQuery = z.infer<typeof userListQuerySchema>
export type UserFormInput = z.infer<typeof userFormSchema>
export type UserCreateInput = z.infer<typeof userCreateSchema>
export type UserUpdateInput = z.infer<typeof userUpdateSchema>
export type UserListResponse = z.infer<typeof userListResponseSchema>
export type UserStatus = z.infer<typeof userStatusSchema>
