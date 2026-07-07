import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  attachmentContentUrlSchema,
  attachmentListResponseSchema,
  attachmentSchema,
  attachmentUploadSessionSchema,
  type Attachment,
  type AttachmentCleanupPolicy,
  type AttachmentContentUrl,
  type AttachmentContentUrlInput,
  type AttachmentListQuery,
  type AttachmentListResponse,
  type AttachmentReadPolicy,
  type AttachmentUploadSession,
} from '@rev30/contracts'
import { api } from '../../api'
import { assertApiResponseOk, normalizeRequestQuery, parseApiResponse } from '../../utils/request'

async function createAttachmentUploadSession(
  file: File,
  input: {
    usage: string
    readPolicy?: AttachmentReadPolicy
    cleanupPolicy?: AttachmentCleanupPolicy
  },
): Promise<AttachmentUploadSession> {
  const contentType = file.type.trim()

  return parseApiResponse(
    await api.attachments['uploads'].$post({
      json: {
        originalName: file.name,
        usage: input.usage,
        readPolicy: input.readPolicy,
        cleanupPolicy: input.cleanupPolicy,
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

  await assertApiResponseOk(response)
}

async function completeAttachmentUploadSession(uploadId: string): Promise<Attachment> {
  return parseApiResponse(
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
    cleanupPolicy?: AttachmentCleanupPolicy
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
  return parseApiResponse(
    await api.attachments[':id'].$get({
      param: { id },
    }),
    attachmentSchema,
  )
}

export async function listAttachments(query: AttachmentListQuery): Promise<AttachmentListResponse> {
  return parseApiResponse(
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
  return parseApiResponse(
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
  await assertApiResponseOk(
    await api.attachments[':id'].$delete({
      param: { id },
    }),
  )
}
