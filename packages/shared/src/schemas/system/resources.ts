import { z } from 'zod'
import { nonBlankString, optionalNullableString, sortOrderInputSchema } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { hasAnyDefinedValue } from '../common/refinements'
import { iconifyIconNamePattern } from '../icons'
import { optionalNumericQueryValue, optionalQueryValue, optionalTrimmedQueryString } from '../query'

export const RESOURCE_STATUS_DISABLED = 0
export const RESOURCE_STATUS_ENABLED = 1
export const resourceStatusSchema = z.literal(
  [RESOURCE_STATUS_DISABLED, RESOURCE_STATUS_ENABLED],
  '资源状态无效',
)

export const RESOURCE_TYPE_DIRECTORY = 'directory'
export const RESOURCE_TYPE_MENU = 'menu'
export const RESOURCE_TYPE_EXTERNAL = 'external'
export const RESOURCE_TYPE_ACTION = 'action'
export const resourceTypeSchema = z.enum(
  [RESOURCE_TYPE_DIRECTORY, RESOURCE_TYPE_MENU, RESOURCE_TYPE_EXTERNAL, RESOURCE_TYPE_ACTION],
  '资源类型无效',
)

export const RESOURCE_OPEN_TARGET_SELF = 'self'
export const RESOURCE_OPEN_TARGET_BLANK = 'blank'
export const resourceOpenTargetSchema = z.enum(
  [RESOURCE_OPEN_TARGET_SELF, RESOURCE_OPEN_TARGET_BLANK],
  '打开方式无效',
)

const resourceIdSchema = z.uuid('资源 ID 无效')
const resourceNameSchema = nonBlankString('请输入资源名称')
const resourceCodeSchema = nonBlankString('请输入资源编码')
const optionalKeywordSchema = optionalTrimmedQueryString()
const optionalStatusQuerySchema = optionalNumericQueryValue(resourceStatusSchema)
const optionalTypeQuerySchema = optionalQueryValue(resourceTypeSchema)
const optionalParentIdQuerySchema = optionalQueryValue(resourceIdSchema)

export const iconifyIconNameSchema = z.string().trim().regex(iconifyIconNamePattern, '图标名称无效')

const iconInputSchema = optionalNullableString().pipe(
  z.union([iconifyIconNameSchema, z.null()]).optional(),
)
export const resourceExternalUrlSchema = z.url({ error: '外链地址无效' })

export const resourceSchema = z.object({
  id: resourceIdSchema,
  parentId: resourceIdSchema.nullable(),
  type: resourceTypeSchema,
  name: nonBlankString(),
  code: nonBlankString(),
  path: z.string().nullable(),
  externalUrl: z.string().nullable(),
  openTarget: resourceOpenTargetSchema,
  icon: iconifyIconNameSchema.nullable(),
  hidden: z.boolean(),
  status: resourceStatusSchema,
  sortOrder: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Resource = z.infer<typeof resourceSchema>
export type ResourceTreeNode = Resource & {
  children: ResourceTreeNode[]
}

export const resourceTreeNodeSchema: z.ZodType<ResourceTreeNode> = resourceSchema.extend({
  children: z.lazy(() => resourceTreeNodeSchema.array()),
})

export const resourceListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  type: optionalTypeQuerySchema,
  status: optionalStatusQuerySchema,
  parentId: optionalParentIdQuerySchema,
})

const resourceFormBaseSchema = z.object({
  type: resourceTypeSchema,
  name: resourceNameSchema,
  code: resourceCodeSchema,
  parentId: resourceIdSchema.nullable(),
  path: optionalNullableString(),
  externalUrl: optionalNullableString(),
  openTarget: resourceOpenTargetSchema.optional(),
  icon: iconInputSchema,
  hidden: z.boolean(),
  status: resourceStatusSchema,
  sortOrder: sortOrderInputSchema,
})

function validateResourceTypeFields(
  input: z.infer<typeof resourceFormBaseSchema>,
  context: z.RefinementCtx,
) {
  if (input.type === RESOURCE_TYPE_MENU && input.path == null) {
    context.addIssue({
      code: 'custom',
      path: ['path'],
      message: '内部菜单路径不能为空',
    })
  }

  if (input.type !== RESOURCE_TYPE_EXTERNAL) {
    return
  }

  if (input.externalUrl == null) {
    context.addIssue({
      code: 'custom',
      path: ['externalUrl'],
      message: '外链地址不能为空',
    })
    return
  }

  const externalUrlResult = resourceExternalUrlSchema.safeParse(input.externalUrl)

  if (!externalUrlResult.success) {
    context.addIssue({
      code: 'custom',
      path: ['externalUrl'],
      message: '外链地址无效',
    })
  }
}

export const resourceFormSchema = resourceFormBaseSchema.superRefine(validateResourceTypeFields)

function defaultOpenTarget(type: Resource['type']) {
  return type === RESOURCE_TYPE_EXTERNAL ? RESOURCE_OPEN_TARGET_BLANK : RESOURCE_OPEN_TARGET_SELF
}

function normalizeResourceCreateInput(input: z.infer<typeof resourceFormBaseSchema>) {
  const output = {
    ...input,
    path: input.path ?? null,
    externalUrl: input.externalUrl ?? null,
    openTarget: input.openTarget ?? defaultOpenTarget(input.type),
    icon: input.icon ?? null,
  }

  if (output.type === RESOURCE_TYPE_MENU) {
    output.externalUrl = null
  }

  if (output.type === RESOURCE_TYPE_EXTERNAL) {
    output.path = null
  }

  if (output.type === RESOURCE_TYPE_DIRECTORY || output.type === RESOURCE_TYPE_ACTION) {
    output.path = null
    output.externalUrl = null
    output.openTarget = RESOURCE_OPEN_TARGET_SELF
  }

  return output
}

export const resourceCreateSchema = resourceFormBaseSchema
  .extend({
    parentId: resourceIdSchema.nullable().default(null),
    hidden: z.boolean().default(false),
    status: resourceStatusSchema.default(RESOURCE_STATUS_ENABLED),
    sortOrder: sortOrderInputSchema.default(0),
  })
  .transform(normalizeResourceCreateInput)

function normalizeResourceUpdateInput(
  input: z.infer<ReturnType<typeof resourceFormBaseSchema.partial>>,
) {
  const output = {
    ...input,
  }

  if (output.type === RESOURCE_TYPE_MENU) {
    if (output.externalUrl !== undefined) {
      output.externalUrl = null
    }
  }

  if (output.type === RESOURCE_TYPE_EXTERNAL) {
    if (output.path !== undefined) {
      output.path = null
    }
  }

  if (output.type === RESOURCE_TYPE_DIRECTORY || output.type === RESOURCE_TYPE_ACTION) {
    if (output.path !== undefined) {
      output.path = null
    }

    if (output.externalUrl !== undefined) {
      output.externalUrl = null
    }

    output.openTarget = RESOURCE_OPEN_TARGET_SELF
  }

  return output
}

export const resourceUpdateSchema = resourceFormBaseSchema
  .partial()
  .transform(normalizeResourceUpdateInput)
  .refine(hasAnyDefinedValue, {
    message: '至少修改一个字段',
  })

export const resourceListResponseSchema = z.object({
  list: z.array(resourceSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>
export type ResourceFormInput = z.infer<typeof resourceFormSchema>
export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>
export type ResourceListResponse = z.infer<typeof resourceListResponseSchema>
export type ResourceStatus = z.infer<typeof resourceStatusSchema>
export type ResourceType = z.infer<typeof resourceTypeSchema>
export type ResourceOpenTarget = z.infer<typeof resourceOpenTargetSchema>
