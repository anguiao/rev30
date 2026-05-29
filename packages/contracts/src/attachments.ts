import { z } from 'zod'

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
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  extension: z.string().min(1),
  size: z.number().int().min(0),
  usage: attachmentUsageSchema,
  createdAt: z.iso.datetime(),
})

export const attachmentSignedUrlInputSchema = z
  .object({
    disposition: attachmentDispositionSchema.default(ATTACHMENT_DISPOSITION_ATTACHMENT),
  })
  .default({
    disposition: ATTACHMENT_DISPOSITION_ATTACHMENT,
  })

export const attachmentSignedUrlSchema = z.object({
  url: z.string().min(1),
  expiresAt: z.iso.datetime(),
})

export type AttachmentUsage = z.infer<typeof attachmentUsageSchema>
export type AttachmentDisposition = z.infer<typeof attachmentDispositionSchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type AttachmentSignedUrlInput = z.infer<typeof attachmentSignedUrlInputSchema>
export type AttachmentSignedUrl = z.infer<typeof attachmentSignedUrlSchema>
