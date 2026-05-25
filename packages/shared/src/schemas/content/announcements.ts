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

export const tiptapDocumentSchema = z.looseObject({
  type: z.literal('doc', '正文格式无效'),
})

export const announcementSchema = z.object({
  id: announcementIdSchema,
  type: announcementTypeSchema,
  title: announcementTitleSchema,
  summary: announcementSummarySchema,
  contentJson: tiptapDocumentSchema,
  contentText: announcementContentTextSchema,
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
  pinned: z.boolean(),
  publish: z.boolean(),
})

export const announcementCreateSchema = announcementFormSchema.extend({
  publish: z.boolean().default(false),
  pinned: z.boolean().default(false),
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

export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>
export type Announcement = z.infer<typeof announcementSchema>
export type AnnouncementListItem = z.infer<typeof announcementListItemSchema>
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>
export type AnnouncementFormInput = z.infer<typeof announcementFormSchema>
export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>
export type AnnouncementType = z.infer<typeof announcementTypeSchema>
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>
