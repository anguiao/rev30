import { z } from 'zod'
import { nonBlankString, sortOrderInputSchema } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { ensureUniqueItems, hasAnyDefinedValue } from '../common/refinements'
import {
  includeIdsQueryValue,
  optionalNumericQueryValue,
  optionalTrimmedQueryString,
} from '../query'
import { resourceTypeSchema, type Resource } from './resources'

export const ROLE_STATUS_DISABLED = 0
export const ROLE_STATUS_ENABLED = 1
export const BUILT_IN_ADMIN_ROLE_CODE = 'admin'
export const roleStatusSchema = z.literal(
  [ROLE_STATUS_DISABLED, ROLE_STATUS_ENABLED],
  '角色状态无效',
)

const roleIdSchema = z.uuid('角色 ID 无效')
const resourceIdSchema = z.uuid('资源 ID 无效')
const roleNameSchema = nonBlankString('请输入名称')
const roleCodeSchema = nonBlankString('请输入编码')

const optionalKeywordSchema = optionalTrimmedQueryString()
const optionalStatusQuerySchema = optionalNumericQueryValue(roleStatusSchema)

export const roleSummarySchema = z.object({
  id: roleIdSchema,
  name: nonBlankString(),
  code: nonBlankString(),
})

export const roleResourceSchema = z.object({
  id: resourceIdSchema,
  name: nonBlankString(),
  code: nonBlankString(),
  type: resourceTypeSchema,
})

const roleBaseSchema = roleSummarySchema.extend({
  status: roleStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const roleListItemSchema = roleBaseSchema.extend({
  userCount: z.number().int().min(0),
})

export const roleSchema = roleBaseSchema.extend({
  resources: z.array(roleResourceSchema),
})

const roleResourceIdsMaxLength = 500
export const roleResourceIdsSchema = z
  .array(resourceIdSchema)
  .max(roleResourceIdsMaxLength, `权限资源不能超过 ${roleResourceIdsMaxLength} 个`)
  .superRefine(ensureUniqueItems('资源不能重复'))

export const roleOptionsQuerySchema = z.object({
  includeIds: includeIdsQueryValue(roleIdSchema),
})

export const roleOptionSchema = roleSchema.pick({
  id: true,
  name: true,
  code: true,
  status: true,
})

export const roleOptionsResponseSchema = z.array(roleOptionSchema)

export function createRoleResourceIdsSchema(
  resources: readonly Pick<Resource, 'id' | 'parentId'>[],
) {
  const parentIdsByResourceId = new Map(
    resources.map((resource) => [resource.id, resource.parentId]),
  )

  return roleResourceIdsSchema.refine((resourceIds) => {
    const selectedIds = new Set(resourceIds)

    return resourceIds.every((resourceId) => {
      const parentId = parentIdsByResourceId.get(resourceId)

      return parentId === undefined || parentId === null || selectedIds.has(parentId)
    })
  }, '子级权限资源需要包含所有上级权限资源')
}

const roleIdsMaxLength = 50
export const roleIdsSchema = z
  .array(roleIdSchema)
  .max(roleIdsMaxLength, `用户角色不能超过 ${roleIdsMaxLength} 个`)
  .superRefine(ensureUniqueItems('角色不能重复'))

export const roleListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
})

export const roleFormSchema = z.object({
  name: roleNameSchema,
  code: roleCodeSchema,
  status: roleStatusSchema,
  sortOrder: sortOrderInputSchema,
  resourceIds: roleResourceIdsSchema,
})

export const roleCreateSchema = roleFormSchema.extend({
  status: roleStatusSchema.default(ROLE_STATUS_ENABLED),
  sortOrder: sortOrderInputSchema.default(0),
  resourceIds: roleResourceIdsSchema.optional(),
})

export const roleUpdateSchema = roleFormSchema.partial().refine(hasAnyDefinedValue, {
  message: '至少修改一个字段',
})

export const roleListResponseSchema = z.object({
  list: z.array(roleListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type RoleOptionsQuery = z.infer<typeof roleOptionsQuerySchema>
export type RoleOption = z.infer<typeof roleOptionSchema>
export type RoleOptionsResponse = z.infer<typeof roleOptionsResponseSchema>

export type RoleSummary = z.infer<typeof roleSummarySchema>
export type RoleResource = z.infer<typeof roleResourceSchema>
export type RoleListItem = z.infer<typeof roleListItemSchema>
export type Role = z.infer<typeof roleSchema>
export type RoleListQuery = z.infer<typeof roleListQuerySchema>
export type RoleFormInput = z.infer<typeof roleFormSchema>
export type RoleCreateInput = z.infer<typeof roleCreateSchema>
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>
export type RoleListResponse = z.infer<typeof roleListResponseSchema>
export type RoleStatus = z.infer<typeof roleStatusSchema>
