import { z } from 'zod'
import { nonBlankString, optionalNullableString } from '../common/inputs'
import { paginationQuerySchema } from '../common/pagination'
import { hasAnyDefinedValue } from '../common/refinements'
import { optionalQueryValue, optionalTrimmedQueryString } from '../query'

export const ANNOUNCEMENT_TYPE_NOTICE = 'notice'
export const ANNOUNCEMENT_TYPE_ANNOUNCEMENT = 'announcement'
export const announcementTypeSchema = z.enum(
  [ANNOUNCEMENT_TYPE_NOTICE, ANNOUNCEMENT_TYPE_ANNOUNCEMENT],
  '公告类型无效',
)

export const ANNOUNCEMENT_STATUS_DRAFT = 'draft'
export const ANNOUNCEMENT_STATUS_PUBLISHED = 'published'
export const ANNOUNCEMENT_STATUS_ARCHIVED = 'archived'
export const announcementStatusSchema = z.enum(
  [ANNOUNCEMENT_STATUS_DRAFT, ANNOUNCEMENT_STATUS_PUBLISHED, ANNOUNCEMENT_STATUS_ARCHIVED],
  '公告状态无效',
)

const announcementIdSchema = z.uuid('通知公告 ID 无效')
const announcementTitleSchema = nonBlankString('请输入公告标题').max(100, '公告标题不能超过 100 个字符')
const announcementSummarySchema = z.union([z.string().max(300), z.null()])
const announcementSummaryInputSchema = optionalNullableString().pipe(
  z.union([z.string().trim().max(300, '公告摘要不能超过 300 个字符'), z.null()]).optional(),
)
const announcementContentTextSchema = z.string()

const tiptapDocumentSchema = z
  .object({
    type: z.literal('doc', '公告正文格式无效'),
  })
  .passthrough()

function normalizeOptionalBooleanQueryValue(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  return value
}

const optionalPinnedQuerySchema = z.preprocess(
  normalizeOptionalBooleanQueryValue,
  z.boolean('置顶筛选无效').optional(),
)

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
  keyword: optionalTrimmedQueryString(),
  type: optionalQueryValue(announcementTypeSchema),
  status: optionalQueryValue(announcementStatusSchema),
  pinned: optionalPinnedQuerySchema,
})

const announcementWriteBaseSchema = z.object({
  type: announcementTypeSchema,
  title: announcementTitleSchema,
  summary: announcementSummaryInputSchema,
  contentJson: tiptapDocumentSchema,
  pinned: z.boolean(),
})

const announcementUpdateFieldsSchema = announcementWriteBaseSchema.extend({
  publish: z.boolean(),
})

const partialAnnouncementUpdateFieldsSchema = announcementUpdateFieldsSchema.partial()

type AnnouncementUpdateFields = z.infer<typeof partialAnnouncementUpdateFieldsSchema>

function hasMeaningfulAnnouncementUpdate(input: AnnouncementUpdateFields) {
  const { publish, ...rest } = input

  return publish === true || hasAnyDefinedValue(rest)
}

export const announcementCreateSchema = announcementWriteBaseSchema.extend({
  publish: z.boolean().default(false),
  pinned: z.boolean().default(false),
})

export const announcementUpdateSchema = partialAnnouncementUpdateFieldsSchema.refine(
  hasMeaningfulAnnouncementUpdate,
  {
    message: '至少修改一个字段',
  },
)

export const announcementListResponseSchema = z.object({
  list: z.array(announcementListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>
export type AnnouncementType = z.infer<typeof announcementTypeSchema>
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>
export type Announcement = z.infer<typeof announcementSchema>
export type AnnouncementListItem = z.infer<typeof announcementListItemSchema>
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>
export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>
