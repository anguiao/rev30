import { z } from 'zod'
import { nonBlankString, sortOrderInputSchema } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { hasAnyDefinedValue } from '../common/refinements'
import {
  includeIdsQueryValue,
  optionalNumericQueryValue,
  optionalQueryValue,
  optionalTrimmedQueryString,
} from '../query'

export const DEPARTMENT_STATUS_DISABLED = 0
export const DEPARTMENT_STATUS_ENABLED = 1
export const departmentStatusSchema = z.literal(
  [DEPARTMENT_STATUS_DISABLED, DEPARTMENT_STATUS_ENABLED],
  '部门状态无效',
)

const departmentIdSchema = z.uuid('部门 ID 无效')
const departmentNameSchema = nonBlankString('请输入名称')
const departmentCodeSchema = nonBlankString('请输入编码')

const optionalParentIdQuerySchema = optionalQueryValue(departmentIdSchema)
const optionalKeywordSchema = optionalTrimmedQueryString()
const optionalStatusQuerySchema = optionalNumericQueryValue(departmentStatusSchema)

export const departmentSummarySchema = z.object({
  id: departmentIdSchema,
  name: nonBlankString(),
  code: nonBlankString(),
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

export const departmentListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  status: optionalStatusQuerySchema,
  parentId: optionalParentIdQuerySchema,
})

export const departmentTreeOptionsQuerySchema = z.object({
  includeIds: includeIdsQueryValue(departmentIdSchema),
})

const departmentTreeOptionBaseSchema = departmentSchema.pick({
  id: true,
  parentId: true,
  name: true,
  code: true,
  status: true,
})

export type DepartmentTreeOption = z.infer<typeof departmentTreeOptionBaseSchema> & {
  children: DepartmentTreeOption[]
}

export const departmentTreeOptionSchema: z.ZodType<DepartmentTreeOption> =
  departmentTreeOptionBaseSchema.extend({
    children: z.lazy(() => departmentTreeOptionSchema.array()),
  })

export const departmentTreeOptionsResponseSchema = z.array(departmentTreeOptionSchema)

export const departmentFormSchema = z.object({
  name: departmentNameSchema,
  code: departmentCodeSchema,
  parentId: departmentIdSchema.nullable(),
  status: departmentStatusSchema,
  sortOrder: sortOrderInputSchema,
})

export const departmentCreateSchema = departmentFormSchema.extend({
  parentId: departmentIdSchema.nullable().default(null),
  status: departmentStatusSchema.default(DEPARTMENT_STATUS_ENABLED),
  sortOrder: sortOrderInputSchema.default(0),
})

export const departmentUpdateSchema = departmentFormSchema.partial().refine(hasAnyDefinedValue, {
  message: '至少修改一个字段',
})

export const departmentListResponseSchema = z.object({
  list: z.array(departmentSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type DepartmentTreeOptionsQuery = z.infer<typeof departmentTreeOptionsQuerySchema>
export type DepartmentTreeOptionsResponse = z.infer<typeof departmentTreeOptionsResponseSchema>
export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>
export type DepartmentFormInput = z.infer<typeof departmentFormSchema>
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>
export type DepartmentListResponse = z.infer<typeof departmentListResponseSchema>
export type DepartmentStatus = z.infer<typeof departmentStatusSchema>
