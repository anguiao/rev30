import { z } from 'zod'

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

const nonBlankStringSchema = z.string().trim().min(1, '不能为空')
const resourceIdSchema = z.uuid('资源 ID 无效')
const pageSchema = z.coerce
  .number('页码必须是数字')
  .int('页码必须是整数')
  .min(1, '页码不能小于 1')
const pageSizeSchema = z.coerce
  .number('每页数量必须是数字')
  .int('每页数量必须是整数')
  .min(1, '每页数量不能小于 1')
  .max(100, '每页数量不能超过 100')

function isBlankString(value: unknown) {
  return typeof value === 'string' && value.trim() === ''
}

const optionalKeywordSchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  z.string().trim().optional(),
)
const optionalStatusQuerySchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  z.coerce.number().pipe(resourceStatusSchema).optional(),
)
const optionalTypeQuerySchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  resourceTypeSchema.optional(),
)
const optionalParentIdQuerySchema = z.preprocess(
  (value) => (isBlankString(value) ? undefined : value),
  resourceIdSchema.optional(),
)
const nullableTextInputSchema = z.preprocess(
  (value) => (isBlankString(value) ? null : value),
  z.union([z.string().trim().min(1, '不能为空'), z.null()]).optional(),
)
const nullableUrlInputSchema = z.preprocess(
  (value) => (isBlankString(value) ? null : value),
  z.union([z.string().trim().min(1, '不能为空'), z.null()]).optional(),
)

export const resourceSchema = z.object({
  id: resourceIdSchema,
  parentId: resourceIdSchema.nullable(),
  type: resourceTypeSchema,
  name: nonBlankStringSchema,
  code: nonBlankStringSchema,
  path: z.string().nullable(),
  externalUrl: z.string().nullable(),
  openTarget: resourceOpenTargetSchema,
  icon: z.string().nullable(),
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

export const resourceListQuerySchema = z.object({
  page: pageSchema.default(1),
  pageSize: pageSizeSchema.default(20),
  keyword: optionalKeywordSchema,
  type: optionalTypeQuerySchema,
  status: optionalStatusQuerySchema,
  parentId: optionalParentIdQuerySchema,
})

const resourceCreateBaseSchema = z.object({
  type: resourceTypeSchema,
  name: z.string().trim().min(1, '请输入资源名称'),
  code: z.string().trim().min(1, '请输入资源编码'),
  parentId: resourceIdSchema.nullable().default(null),
  path: nullableTextInputSchema,
  externalUrl: nullableUrlInputSchema,
  openTarget: resourceOpenTargetSchema.optional(),
  icon: nullableTextInputSchema,
  hidden: z.boolean().default(false),
  status: resourceStatusSchema.default(RESOURCE_STATUS_ENABLED),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').default(0),
})

function defaultOpenTarget(type: Resource['type']) {
  return type === RESOURCE_TYPE_EXTERNAL ? RESOURCE_OPEN_TARGET_BLANK : RESOURCE_OPEN_TARGET_SELF
}

function normalizeResourceCreateInput(input: z.infer<typeof resourceCreateBaseSchema>) {
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

function validateResourceTypeFields(
  value: { type: Resource['type']; path: string | null; externalUrl: string | null },
  context: z.RefinementCtx,
) {
  if (value.type === RESOURCE_TYPE_MENU && value.path === null) {
    context.addIssue({ code: 'custom', message: '内部菜单路径不能为空', path: ['path'] })
  }

  if (value.type === RESOURCE_TYPE_EXTERNAL && value.externalUrl === null) {
    context.addIssue({ code: 'custom', message: '外链地址不能为空', path: ['externalUrl'] })
  }

  if (value.type === RESOURCE_TYPE_EXTERNAL && value.externalUrl !== null) {
    const normalizedExternalUrl = value.externalUrl.trim()
    const urlResult = z.string().trim().url('外链地址无效').safeParse(normalizedExternalUrl)

    if (!urlResult.success) {
      context.addIssue({
        code: 'custom',
        message: '外链地址无效',
        path: ['externalUrl'],
      })
    }
  }
}

export const resourceCreateSchema = resourceCreateBaseSchema
  .transform(normalizeResourceCreateInput)
  .superRefine(validateResourceTypeFields)

const resourceUpdatePayloadSchema = z.object({
  type: resourceTypeSchema.optional(),
  name: z.string().trim().min(1, '请输入资源名称').optional(),
  code: z.string().trim().min(1, '请输入资源编码').optional(),
  parentId: resourceIdSchema.nullable().optional(),
  path: nullableTextInputSchema,
  externalUrl: nullableUrlInputSchema,
  openTarget: resourceOpenTargetSchema.optional(),
  icon: nullableTextInputSchema,
  hidden: z.boolean().optional(),
  status: resourceStatusSchema.optional(),
  sortOrder: z.coerce.number('排序必须是数字').int('排序必须是整数').optional(),
})

export const resourceUpdateSchema = resourceUpdatePayloadSchema.refine(
  (value) => Object.values(value).some((fieldValue) => fieldValue !== undefined),
  {
    message: '至少修改一个字段',
  },
)

export const resourceListResponseSchema = z.object({
  list: z.array(resourceSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>
export type ResourceCreateInput = z.infer<typeof resourceCreateSchema>
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>
export type ResourceListResponse = z.infer<typeof resourceListResponseSchema>
export type ResourceStatus = z.infer<typeof resourceStatusSchema>
export type ResourceType = z.infer<typeof resourceTypeSchema>
export type ResourceOpenTarget = z.infer<typeof resourceOpenTargetSchema>
