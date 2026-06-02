import { z } from 'zod'
import { nonBlankString } from './common/inputs'
import { paginationQuerySchema } from './common/pagination'
import { optionalQueryValue, optionalTrimmedQueryString } from './query'

export const ATTACHMENT_READ_POLICY_SIGNED = 'signed'
export const ATTACHMENT_READ_POLICY_AUTHENTICATED = 'authenticated'

export const attachmentReadPolicySchema = z.enum(
  [ATTACHMENT_READ_POLICY_SIGNED, ATTACHMENT_READ_POLICY_AUTHENTICATED],
  '访问方式无效',
)

export const attachmentUsageSchema = nonBlankString('上传用途无效')

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
  readPolicy: attachmentReadPolicySchema,
  createdAt: z.iso.datetime(),
})

const optionalUsageQuerySchema = optionalQueryValue(attachmentUsageSchema)
const optionalKeywordSchema = optionalTrimmedQueryString()

export const attachmentCreatedBySchema = z.object({
  id: z.uuid('上传人 ID 无效'),
  username: nonBlankString(),
  nickname: nonBlankString(),
})

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  usage: optionalUsageQuerySchema,
  keyword: optionalKeywordSchema,
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

export const attachmentTransferRequestSchema = z.object({
  url: nonBlankString(),
  method: z.enum(['GET', 'PUT']),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
})

export const attachmentUploadSessionCreateInputSchema = z
  .object({
    originalName: nonBlankString(),
    usage: attachmentUsageSchema,
    readPolicy: attachmentReadPolicySchema.default(ATTACHMENT_READ_POLICY_SIGNED),
    size: z.number().int().min(0),
    contentType: nonBlankString().optional(),
  })
  .strict()

export const attachmentUploadSessionSchema = z.object({
  uploadId: z.uuid('上传会话 ID 无效'),
  request: attachmentTransferRequestSchema.extend({
    method: z.literal('PUT'),
  }),
})

export const attachmentUploadSessionCompleteInputSchema = z.object({}).strict().default({})

export const attachmentContentUrlInputSchema = z
  .object({
    disposition: attachmentDispositionSchema.default(ATTACHMENT_DISPOSITION_ATTACHMENT),
  })
  .strict()
  .default({
    disposition: ATTACHMENT_DISPOSITION_ATTACHMENT,
  })

export const attachmentContentUrlSchema = z.object({
  request: attachmentTransferRequestSchema.extend({
    method: z.literal('GET'),
  }),
})

export type AttachmentUsage = z.infer<typeof attachmentUsageSchema>
export type AttachmentReadPolicy = z.infer<typeof attachmentReadPolicySchema>
export type AttachmentDisposition = z.infer<typeof attachmentDispositionSchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type AttachmentCreatedBy = z.infer<typeof attachmentCreatedBySchema>
export type AttachmentListQuery = z.infer<typeof attachmentListQuerySchema>
export type AttachmentListItem = z.infer<typeof attachmentListItemSchema>
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>
export type AttachmentTransferRequest = z.infer<typeof attachmentTransferRequestSchema>
export type AttachmentUploadSessionCreateInput = z.infer<
  typeof attachmentUploadSessionCreateInputSchema
>
export type AttachmentUploadSession = z.infer<typeof attachmentUploadSessionSchema>
export type AttachmentUploadSessionCompleteInput = z.infer<
  typeof attachmentUploadSessionCompleteInputSchema
>
export type AttachmentContentUrlInput = z.infer<typeof attachmentContentUrlInputSchema>
export type AttachmentContentUrl = z.infer<typeof attachmentContentUrlSchema>
