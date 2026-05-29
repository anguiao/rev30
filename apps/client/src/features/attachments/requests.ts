import {
  attachmentSchema,
  attachmentSignedUrlInputSchema,
  attachmentSignedUrlSchema,
  errorResponseSchema,
  type Attachment,
  type AttachmentSignedUrl,
  type AttachmentSignedUrlInput,
  type AttachmentUsage,
  type ErrorResponse,
} from '@rev30/contracts'
import type { z } from 'zod'
import { api } from '../../api'

export class AttachmentRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly field?: ErrorResponse['field'],
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
      result.success ? result.data.field : undefined,
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
  return parseAttachmentResponse(
    await api.attachments.$post({
      form: {
        file,
        usage: input.usage,
      },
    }),
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

export async function createAttachmentSignedUrl(
  id: string,
  input: AttachmentSignedUrlInput = attachmentSignedUrlInputSchema.parse({}),
): Promise<AttachmentSignedUrl> {
  // The server route parses raw JSON manually to normalize malformed-body errors,
  // so Hono cannot infer the json input type for this handler.
  const requestSignedUrl = api.attachments[':id']['signed-url'].$post as unknown as (input: {
    param: { id: string }
    json: AttachmentSignedUrlInput
  }) => Promise<Response>

  return parseAttachmentResponse(
    await requestSignedUrl({
      json: attachmentSignedUrlInputSchema.parse(input),
      param: { id },
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
