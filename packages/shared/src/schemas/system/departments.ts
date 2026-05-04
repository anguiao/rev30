import { z } from 'zod'
import { blankStringToUndefined } from '../utils'

export const DEPARTMENT_STATUS_DISABLED = 0
export const DEPARTMENT_STATUS_ENABLED = 1
export const departmentStatusSchema = z.literal(
  [DEPARTMENT_STATUS_DISABLED, DEPARTMENT_STATUS_ENABLED],
  '部门状态无效',
)

const nonBlankStringSchema = z.string().trim().min(1, '不能为空')

const departmentIdSchema = z.uuid('部门 ID 无效')
const optionalParentIdQuerySchema = z.preprocess(
  blankStringToUndefined,
  departmentIdSchema.optional(),
)
const optionalKeywordSchema = z.preprocess(
  blankStringToUndefined,
  z.string().trim().optional(),
)
const optionalStatusQuerySchema = z.preprocess(
  blankStringToUndefined,
  z.coerce.number().pipe(departmentStatusSchema).optional(),
)

const pageSchema = z.coerce.number('页码必须是数字').int('页码必须是整数').min(1, '页码不能小于 1')
const pageSizeSchema = z.coerce
  .number('每页数量必须是数字')
  .int('每页数量必须是整数')
  .min(1, '每页数量不能小于 1')
  .max(100, '每页数量不能超过 100')

export const departmentSummarySchema = z.object({
  id: departmentIdSchema,
  name: nonBlankStringSchema,
  code: nonBlankStringSchema,
})

export const departmentSchema = departmentSummarySchema.extend({
  parentId: departmentIdSchema.nullable(),
  status: departmentStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Department = z.infer<typeof departmentSchema>
export type DepartmentSummary = z.infer<typeof departmentSummarySchema>
export type DepartmentTreeNode = Department & {
  children: DepartmentTreeNode[]
}

export const departmentTreeNodeSchema: z.ZodType<DepartmentTreeNode> = departmentSchema.extend({
  children: z.lazy(() => departmentTreeNodeSchema.array()),
})

export const departmentListQuerySchema = z.object({
  page: pageSchema.default(1),
  pageSize: pageSizeSchema.default(20),
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
  parentId: optionalParentIdQuerySchema,
})

export const departmentCreateSchema = z.object({
  name: z.string().trim().min(1, '请输入部门名称'),
  code: z.string().trim().min(1, '请输入部门编码'),
  parentId: departmentIdSchema.nullable().default(null),
  status: departmentStatusSchema.default(DEPARTMENT_STATUS_ENABLED),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').default(0),
})

const departmentUpdatePayloadSchema = z.object({
  name: z.string().trim().min(1, '请输入部门名称').optional(),
  code: z.string().trim().min(1, '请输入部门编码').optional(),
  parentId: departmentIdSchema.nullable().optional(),
  status: departmentStatusSchema.optional(),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').optional(),
})

export const departmentUpdateSchema = departmentUpdatePayloadSchema.refine(
  (value) => Object.values(value).some((fieldValue) => fieldValue !== undefined),
  {
    message: '至少修改一个字段',
  },
)

export const departmentListResponseSchema = z.object({
  list: z.array(departmentSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>
export type DepartmentListResponse = z.infer<typeof departmentListResponseSchema>
export type DepartmentStatus = z.infer<typeof departmentStatusSchema>
