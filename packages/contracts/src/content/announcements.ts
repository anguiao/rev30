import { z } from 'zod'
import { nonBlankString, optionalNullableString } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { hasAnyDefinedValue } from '../common/refinements'
import { optionalQueryValue, optionalTrimmedQueryString } from '../query'

export const ANNOUNCEMENT_TYPE_NOTICE = 'notice'
export const ANNOUNCEMENT_TYPE_BULLETIN = 'bulletin'
export const announcementTypeSchema = z.enum(
  [ANNOUNCEMENT_TYPE_NOTICE, ANNOUNCEMENT_TYPE_BULLETIN],
  '类型无效',
)

export const ANNOUNCEMENT_STATUS_DRAFT = 'draft'
export const ANNOUNCEMENT_STATUS_PUBLISHED = 'published'
export const ANNOUNCEMENT_STATUS_ARCHIVED = 'archived'
export const announcementStatusSchema = z.enum(
  [ANNOUNCEMENT_STATUS_DRAFT, ANNOUNCEMENT_STATUS_PUBLISHED, ANNOUNCEMENT_STATUS_ARCHIVED],
  '状态无效',
)

export const ANNOUNCEMENT_VISIBILITY_ALL = 'all'
export const ANNOUNCEMENT_VISIBILITY_TARGETED = 'targeted'
export const announcementVisibilitySchema = z.enum(
  [ANNOUNCEMENT_VISIBILITY_ALL, ANNOUNCEMENT_VISIBILITY_TARGETED],
  '可见范围无效',
)

export const ANNOUNCEMENT_TARGET_TYPE_USER = 'user'
export const ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT = 'department'
export const ANNOUNCEMENT_TARGET_TYPE_ROLE = 'role'
export const announcementTargetTypeSchema = z.enum(
  [
    ANNOUNCEMENT_TARGET_TYPE_USER,
    ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
    ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ],
  '可见对象类型无效',
)

const announcementIdSchema = z.uuid('通知公告 ID 无效')
export const announcementTitleSchema = nonBlankString('请输入标题').max(
  100,
  '标题不能超过 100 个字符',
)
const announcementSummarySchema = z.union([z.string().max(300), z.null()])
export const announcementSummaryInputSchema = optionalNullableString().pipe(
  z.union([z.string().trim().max(300, '摘要不能超过 300 个字符'), z.null()]).optional(),
)
const announcementContentTextSchema = z.string()
const optionalKeywordSchema = optionalTrimmedQueryString()
const optionalTypeQuerySchema = optionalQueryValue(announcementTypeSchema)
const optionalStatusQuerySchema = optionalQueryValue(announcementStatusSchema)
const pinnedQuerySchema = z
  .enum(['true', 'false'], '置顶筛选无效')
  .transform((value) => value === 'true')
const optionalPinnedQuerySchema = optionalQueryValue(pinnedQuerySchema)

function ensureUniqueAnnouncementTargets(
  targets: z.infer<typeof announcementTargetSchema>[],
  context: z.RefinementCtx,
) {
  const seen = new Set<string>()

  for (const target of targets) {
    const key = `${target.targetType}:${target.targetId}`

    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        message: '可见对象不能重复',
      })
      return
    }

    seen.add(key)
  }
}

export const tiptapDocumentSchema = z.looseObject({
  type: z.literal('doc', '正文格式无效'),
})
export const announcementTargetSchema = z.object({
  targetType: announcementTargetTypeSchema,
  targetId: z.uuid('可见对象 ID 无效'),
})

const announcementTargetsMaxLength = 200
export const announcementTargetsSchema = z
  .array(announcementTargetSchema)
  .max(announcementTargetsMaxLength, '可见对象不能超过 200 个')
  .superRefine(ensureUniqueAnnouncementTargets)

export const announcementSchema = z.object({
  id: announcementIdSchema,
  type: announcementTypeSchema,
  title: announcementTitleSchema,
  summary: announcementSummarySchema,
  contentJson: tiptapDocumentSchema,
  contentText: announcementContentTextSchema,
  contentHtml: z.string(),
  visibility: announcementVisibilitySchema,
  targets: announcementTargetsSchema,
  status: announcementStatusSchema,
  pinned: z.boolean(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const announcementListItemSchema = announcementSchema.omit({
  contentJson: true,
  contentText: true,
})

export const announcementListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  type: optionalTypeQuerySchema,
  status: optionalStatusQuerySchema,
  pinned: optionalPinnedQuerySchema,
})

export const announcementFormSchema = z.object({
  type: announcementTypeSchema,
  title: announcementTitleSchema,
  summary: announcementSummaryInputSchema,
  contentJson: tiptapDocumentSchema,
  visibility: announcementVisibilitySchema,
  targets: announcementTargetsSchema,
  pinned: z.boolean(),
  publish: z.boolean(),
})

export const announcementCreateSchema = announcementFormSchema.extend({
  publish: z.boolean().default(false),
  pinned: z.boolean().default(false),
  visibility: announcementVisibilitySchema.default(ANNOUNCEMENT_VISIBILITY_TARGETED),
  targets: announcementTargetsSchema.default([]),
})

export const announcementUpdateSchema = announcementFormSchema
  .partial()
  .transform(({ publish, ...input }) => {
    return {
      ...input,
      ...(publish ? { publish: true as const } : {}),
    }
  })
  .refine(hasAnyDefinedValue, {
    message: '至少修改一个字段',
  })

export const announcementListResponseSchema = z.object({
  list: z.array(announcementListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const announcementMyListQuerySchema = paginationQuerySchema.extend({
  keyword: optionalKeywordSchema,
  type: optionalTypeQuerySchema,
})

export const announcementMyListItemSchema = announcementListItemSchema
  .pick({
    id: true,
    type: true,
    title: true,
    summary: true,
    pinned: true,
    publishedAt: true,
  })
  .extend({
    publishedAt: z.iso.datetime(),
  })

export const announcementMyDetailSchema = announcementMyListItemSchema.extend({
  contentHtml: z.string(),
})

export const announcementMyListResponseSchema = z.object({
  list: z.array(announcementMyListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>
export type Announcement = z.infer<typeof announcementSchema>
export type AnnouncementListItem = z.infer<typeof announcementListItemSchema>
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>
export type AnnouncementVisibility = z.infer<typeof announcementVisibilitySchema>
export type AnnouncementTargetType = z.infer<typeof announcementTargetTypeSchema>
export type AnnouncementTarget = z.infer<typeof announcementTargetSchema>
export type AnnouncementFormInput = z.infer<typeof announcementFormSchema>
export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>
export type AnnouncementMyListQuery = z.infer<typeof announcementMyListQuerySchema>
export type AnnouncementMyListItem = z.infer<typeof announcementMyListItemSchema>
export type AnnouncementMyDetail = z.infer<typeof announcementMyDetailSchema>
export type AnnouncementMyListResponse = z.infer<typeof announcementMyListResponseSchema>
export type AnnouncementType = z.infer<typeof announcementTypeSchema>
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>
