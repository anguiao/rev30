import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  attachmentListResponseSchema,
  attachmentSchema,
  attachmentSignedUrlSchema,
  errorResponseSchema,
  type Attachment,
  type AttachmentSignedUrl,
  type AttachmentSignedUrlInput,
  type AttachmentListQuery,
  type AttachmentListResponse,
  type AttachmentUsage,
} from '@rev30/contracts'
import type { z } from 'zod'
import { api } from '../../api'
import { normalizeRequestQuery } from '../../utils/request'

export class AttachmentRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'AttachmentRequestError'
  }
}

async function parseAttachmentError(response: Response): Promise<AttachmentRequestError> {
  try {
    const result = errorResponseSchema.safeParse(await response.json())

    return new AttachmentRequestError(
      response.status,
      result.success ? result.data.message : '请求失败',
    )
  } catch {
    return new AttachmentRequestError(response.status, '请求失败')
  }
}

async function parseAttachmentResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await parseAttachmentError(response)
  }

  return schema.parse(await response.json())
}

export function getAttachmentErrorMessage(error: unknown, fallback: string) {
  return error instanceof AttachmentRequestError ? error.message : fallback
}

export async function uploadAttachment(
  file: File,
  input: {
    usage: AttachmentUsage
  },
): Promise<Attachment> {
  const form = new FormData()

  form.set('file', file)

  return parseAttachmentResponse(
    await api.attachments.$post(
      {
        query: {
          usage: input.usage,
        },
      },
      {
        init: {
          body: form,
        },
      },
    ),
    attachmentSchema,
  )
}

export async function getAttachment(id: string): Promise<Attachment> {
  return parseAttachmentResponse(
    await api.attachments[':id'].$get({
      param: { id },
    }),
    attachmentSchema,
  )
}

export async function listAttachments(
  query: AttachmentListQuery,
): Promise<AttachmentListResponse> {
  return parseAttachmentResponse(
    await api.attachments.$get({
      query: normalizeRequestQuery(query),
    }),
    attachmentListResponseSchema,
  )
}

export async function createAttachmentSignedUrl(
  id: string,
  input: AttachmentSignedUrlInput = { disposition: ATTACHMENT_DISPOSITION_ATTACHMENT },
): Promise<AttachmentSignedUrl> {
  return parseAttachmentResponse(
    await api.attachments[':id']['signed-url'].$post({
      param: { id },
      json: input,
    }),
    attachmentSignedUrlSchema,
  )
}

export async function deleteAttachment(id: string): Promise<void> {
  const response = await api.attachments[':id'].$delete({
    param: { id },
  })

  if (!response.ok) {
    throw await parseAttachmentError(response)
  }
}
