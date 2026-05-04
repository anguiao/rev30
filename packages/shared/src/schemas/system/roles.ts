import { z } from 'zod'
import { blankStringToUndefined } from '../utils'
import { resourceTypeSchema } from './resources'

export const ROLE_STATUS_DISABLED = 0
export const ROLE_STATUS_ENABLED = 1
export const roleStatusSchema = z.literal(
  [ROLE_STATUS_DISABLED, ROLE_STATUS_ENABLED],
  '角色状态无效',
)

const nonBlankStringSchema = z.string().trim().min(1, '不能为空')
const roleIdSchema = z.uuid('角色 ID 无效')
const resourceIdSchema = z.uuid('资源 ID 无效')

const optionalKeywordSchema = z.preprocess(blankStringToUndefined, z.string().trim().optional())
const optionalStatusQuerySchema = z.preprocess(
  blankStringToUndefined,
  z.coerce.number().pipe(roleStatusSchema).optional(),
)

const pageSchema = z.coerce.number('页码必须是数字').int('页码必须是整数').min(1, '页码不能小于 1')
const pageSizeSchema = z.coerce
  .number('每页数量必须是数字')
  .int('每页数量必须是整数')
  .min(1, '每页数量不能小于 1')
  .max(100, '每页数量不能超过 100')

export const roleSummarySchema = z.object({
  id: roleIdSchema,
  name: nonBlankStringSchema,
  code: nonBlankStringSchema,
})

export const roleResourceSchema = z.object({
  id: resourceIdSchema,
  name: nonBlankStringSchema,
  code: nonBlankStringSchema,
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
  .max(roleResourceIdsMaxLength, `资源授权不能超过 ${roleResourceIdsMaxLength} 个`)
  .superRefine((value, context) => {
    const seenResourceIds = new Set<string>()

    for (const resourceId of value) {
      if (seenResourceIds.has(resourceId)) {
        context.addIssue({
          code: 'custom',
          message: '资源不能重复',
        })
        return
      }

      seenResourceIds.add(resourceId)
    }
  })

const roleIdsMaxLength = 50
export const roleIdsSchema = z
  .array(roleIdSchema)
  .max(roleIdsMaxLength, `用户角色不能超过 ${roleIdsMaxLength} 个`)
  .superRefine((value, context) => {
    const seenRoleIds = new Set<string>()

    for (const roleId of value) {
      if (seenRoleIds.has(roleId)) {
        context.addIssue({
          code: 'custom',
          message: '角色不能重复',
        })
        return
      }

      seenRoleIds.add(roleId)
    }
  })

export const roleListQuerySchema = z.object({
  page: pageSchema.default(1),
  pageSize: pageSizeSchema.default(20),
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
})

export const roleCreateSchema = z.object({
  name: z.string().trim().min(1, '请输入角色名称'),
  code: z.string().trim().min(1, '请输入角色编码'),
  status: roleStatusSchema.default(ROLE_STATUS_ENABLED),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').default(0),
  resourceIds: roleResourceIdsSchema.optional(),
})

const roleUpdatePayloadSchema = z.object({
  name: z.string().trim().min(1, '请输入角色名称').optional(),
  code: z.string().trim().min(1, '请输入角色编码').optional(),
  status: roleStatusSchema.optional(),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').optional(),
  resourceIds: roleResourceIdsSchema.optional(),
})

export const roleUpdateSchema = roleUpdatePayloadSchema.refine(
  (value) => Object.values(value).some((fieldValue) => fieldValue !== undefined),
  {
    message: '至少修改一个字段',
  },
)

export const roleListResponseSchema = z.object({
  list: z.array(roleListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type RoleSummary = z.infer<typeof roleSummarySchema>
export type RoleResource = z.infer<typeof roleResourceSchema>
export type RoleListItem = z.infer<typeof roleListItemSchema>
export type Role = z.infer<typeof roleSchema>
export type RoleListQuery = z.infer<typeof roleListQuerySchema>
export type RoleCreateInput = z.infer<typeof roleCreateSchema>
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>
export type RoleListResponse = z.infer<typeof roleListResponseSchema>
export type RoleStatus = z.infer<typeof roleStatusSchema>
