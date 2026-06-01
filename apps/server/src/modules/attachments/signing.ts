import { createHmac, timingSafeEqual } from 'node:crypto'
import { attachmentDispositionSchema, type AttachmentDisposition } from '@rev30/contracts'
import { z } from 'zod'
import { AttachmentContentUrlInvalidError, AttachmentUploadUrlInvalidError } from './errors'

const uploadTokenPayloadSchema = z.object({
  uploadId: z.uuid(),
  expiresAt: z.iso.datetime(),
})

type UploadTokenPayload = z.infer<typeof uploadTokenPayloadSchema>

const contentTokenPayloadSchema = z.object({
  attachmentId: z.uuid(),
  disposition: attachmentDispositionSchema,
  expiresAt: z.iso.datetime(),
})

type ContentTokenPayload = z.infer<typeof contentTokenPayloadSchema>

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function signaturesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

export function createAttachmentUploadToken(
  input: {
    uploadId: string
    expiresAt: Date
  },
  secret: string,
) {
  const payload: UploadTokenPayload = {
    uploadId: input.uploadId,
    expiresAt: input.expiresAt.toISOString(),
  }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = signPayload(encodedPayload, secret)

  return `${encodedPayload}.${signature}`
}

export function verifyAttachmentUploadToken(
  token: string,
  options: {
    now: Date
    secret: string
    uploadId: string
  },
) {
  const parts = token.split('.')

  if (parts.length !== 2) {
    throw new AttachmentUploadUrlInvalidError()
  }

  const [encodedPayload, signature] = parts

  if (!encodedPayload || !signature) {
    throw new AttachmentUploadUrlInvalidError()
  }

  const expectedSignature = signPayload(encodedPayload, options.secret)

  if (!signaturesMatch(signature, expectedSignature)) {
    throw new AttachmentUploadUrlInvalidError()
  }

  let payload: unknown

  try {
    payload = JSON.parse(decode(encodedPayload))
  } catch {
    throw new AttachmentUploadUrlInvalidError()
  }

  const result = uploadTokenPayloadSchema.safeParse(payload)

  if (!result.success || result.data.uploadId !== options.uploadId) {
    throw new AttachmentUploadUrlInvalidError()
  }

  const expiresAt = new Date(result.data.expiresAt)

  if (expiresAt.getTime() <= options.now.getTime()) {
    throw new AttachmentUploadUrlInvalidError()
  }

  return {
    uploadId: result.data.uploadId,
    expiresAt,
  }
}

export function createAttachmentContentToken(
  input: {
    attachmentId: string
    disposition: AttachmentDisposition
    expiresAt: Date
  },
  secret: string,
) {
  const payload: ContentTokenPayload = {
    attachmentId: input.attachmentId,
    disposition: input.disposition,
    expiresAt: input.expiresAt.toISOString(),
  }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = signPayload(encodedPayload, secret)

  return `${encodedPayload}.${signature}`
}

export function verifyAttachmentContentToken(
  token: string,
  options: {
    attachmentId: string
    now: Date
    secret: string
  },
) {
  const parts = token.split('.')

  if (parts.length !== 2) {
    throw new AttachmentContentUrlInvalidError()
  }

  const [encodedPayload, signature] = parts

  if (!encodedPayload || !signature) {
    throw new AttachmentContentUrlInvalidError()
  }

  const expectedSignature = signPayload(encodedPayload, options.secret)

  if (!signaturesMatch(signature, expectedSignature)) {
    throw new AttachmentContentUrlInvalidError()
  }

  let payload: unknown

  try {
    payload = JSON.parse(decode(encodedPayload))
  } catch {
    throw new AttachmentContentUrlInvalidError()
  }

  const result = contentTokenPayloadSchema.safeParse(payload)

  if (!result.success || result.data.attachmentId !== options.attachmentId) {
    throw new AttachmentContentUrlInvalidError()
  }

  const expiresAt = new Date(result.data.expiresAt)

  if (expiresAt.getTime() <= options.now.getTime()) {
    throw new AttachmentContentUrlInvalidError()
  }

  return {
    attachmentId: result.data.attachmentId,
    disposition: result.data.disposition,
    expiresAt,
  }
}
