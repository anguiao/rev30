import { z } from 'zod'
import { nonBlankString } from './common/inputs'
import { paginationQuerySchema } from './common/pagination'
import { optionalQueryValue, optionalTrimmedQueryString } from './query'

export const ATTACHMENT_USAGE_GENERAL = 'general'
export const ATTACHMENT_USAGE_AVATAR = 'avatar'
export const ATTACHMENT_USAGE_RICH_TEXT = 'rich-text'

export const attachmentUsageSchema = z.enum(
  [ATTACHMENT_USAGE_GENERAL, ATTACHMENT_USAGE_AVATAR, ATTACHMENT_USAGE_RICH_TEXT],
  '上传用途无效',
)

export const ATTACHMENT_DISPOSITION_INLINE = 'inline'
export const ATTACHMENT_DISPOSITION_ATTACHMENT = 'attachment'

export const attachmentDispositionSchema = z.enum(
  [ATTACHMENT_DISPOSITION_INLINE, ATTACHMENT_DISPOSITION_ATTACHMENT],
  '读取方式无效',
)

const attachmentIdSchema = z.uuid('附件 ID 无效')

export const attachmentSchema = z.object({
  id: attachmentIdSchema,
  originalName: nonBlankString(),
  mimeType: nonBlankString(),
  extension: nonBlankString(),
  size: z.number().int().min(0),
  usage: attachmentUsageSchema,
  createdAt: z.iso.datetime(),
})

const optionalUsageQuerySchema = optionalQueryValue(attachmentUsageSchema)
const optionalKeywordSchema = optionalTrimmedQueryString()

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  usage: optionalUsageQuerySchema,
  keyword: optionalKeywordSchema,
})

export const attachmentCreatedBySchema = z.object({
  id: z.uuid('上传人 ID 无效'),
  username: nonBlankString(),
  nickname: nonBlankString(),
})

export const attachmentListItemSchema = attachmentSchema.extend({
  createdBy: attachmentCreatedBySchema,
})

export const attachmentListResponseSchema = z.object({
  list: z.array(attachmentListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})

export const attachmentSignedUrlInputSchema = z
  .object({
    disposition: attachmentDispositionSchema.default(ATTACHMENT_DISPOSITION_ATTACHMENT),
  })
  .strict()
  .default({
    disposition: ATTACHMENT_DISPOSITION_ATTACHMENT,
  })

export const attachmentSignedUrlSchema = z.object({
  url: nonBlankString(),
  expiresAt: z.iso.datetime(),
})

export type AttachmentUsage = z.infer<typeof attachmentUsageSchema>
export type AttachmentDisposition = z.infer<typeof attachmentDispositionSchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type AttachmentSignedUrlInput = z.infer<typeof attachmentSignedUrlInputSchema>
export type AttachmentSignedUrl = z.infer<typeof attachmentSignedUrlSchema>
export type AttachmentListQuery = z.infer<typeof attachmentListQuerySchema>
export type AttachmentCreatedBy = z.infer<typeof attachmentCreatedBySchema>
export type AttachmentListItem = z.infer<typeof attachmentListItemSchema>
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>
