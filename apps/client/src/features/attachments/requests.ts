import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  attachmentContentUrlSchema,
  attachmentListResponseSchema,
  attachmentSchema,
  attachmentUploadSessionSchema,
  errorResponseSchema,
  type Attachment,
  type AttachmentContentUrl,
  type AttachmentContentUrlInput,
  type AttachmentListQuery,
  type AttachmentListResponse,
  type AttachmentReadPolicy,
  type AttachmentUploadSession,
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

async function createAttachmentUploadSession(
  file: File,
  input: {
    usage: string
    readPolicy?: AttachmentReadPolicy
  },
): Promise<AttachmentUploadSession> {
  const contentType = file.type.trim()

  return parseAttachmentResponse(
    await api.attachments['uploads'].$post({
      json: {
        originalName: file.name,
        usage: input.usage,
        readPolicy: input.readPolicy,
        size: file.size,
        ...(contentType ? { contentType } : {}),
      },
    }),
    attachmentUploadSessionSchema,
  )
}

async function uploadAttachmentContent(session: AttachmentUploadSession, file: File) {
  const response = await fetch(session.request.url, {
    method: session.request.method,
    headers: session.request.headers,
    body: file,
  })

  if (!response.ok) {
    throw await parseAttachmentError(response)
  }
}

async function completeAttachmentUploadSession(uploadId: string): Promise<Attachment> {
  return parseAttachmentResponse(
    await api.attachments['uploads'][':uploadId'].complete.$post({
      param: {
        uploadId,
      },
      json: {},
    }),
    attachmentSchema,
  )
}

export async function uploadAttachment(
  file: File,
  input: {
    usage: string
    readPolicy?: AttachmentReadPolicy
  },
) {
  const session = await createAttachmentUploadSession(file, input)

  await uploadAttachmentContent(session, file)

  const attachment = await completeAttachmentUploadSession(session.uploadId)

  return {
    id: attachment.id,
  }
}

export async function getAttachment(id: string): Promise<Attachment> {
  return parseAttachmentResponse(
    await api.attachments[':id'].$get({
      param: { id },
    }),
    attachmentSchema,
  )
}

export async function listAttachments(query: AttachmentListQuery): Promise<AttachmentListResponse> {
  return parseAttachmentResponse(
    await api.attachments.$get({
      query: normalizeRequestQuery(query),
    }),
    attachmentListResponseSchema,
  )
}

async function createAttachmentContentUrl(
  id: string,
  input: AttachmentContentUrlInput = { disposition: ATTACHMENT_DISPOSITION_ATTACHMENT },
): Promise<AttachmentContentUrl> {
  return parseAttachmentResponse(
    await api.attachments[':id']['content-url'].$post({
      param: { id },
      json: input,
    }),
    attachmentContentUrlSchema,
  )
}

export function getAttachmentContentUrl(id: string) {
  return `/api/attachments/${encodeURIComponent(id)}/content`
}

export async function resolveSignedAttachmentUrl(
  id: string,
  input: AttachmentContentUrlInput = { disposition: ATTACHMENT_DISPOSITION_ATTACHMENT },
) {
  const contentUrl = await createAttachmentContentUrl(id, input)

  return {
    expiresAt: contentUrl.request.expiresAt,
    url: contentUrl.request.url,
  }
}

export async function deleteAttachment(id: string): Promise<void> {
  const response = await api.attachments[':id'].$delete({
    param: { id },
  })

  if (!response.ok) {
    throw await parseAttachmentError(response)
  }
}
