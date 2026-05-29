import { createHmac, timingSafeEqual } from 'node:crypto'
import { attachmentDispositionSchema, type AttachmentDisposition } from '@rev30/contracts'
import { z } from 'zod'
import { AttachmentSignedUrlInvalidError } from './errors'

const tokenPayloadSchema = z.object({
  attachmentId: z.uuid(),
  disposition: attachmentDispositionSchema,
  expiresAt: z.iso.datetime(),
})

type TokenPayload = z.infer<typeof tokenPayloadSchema>

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

function parsePayload(encodedPayload: string) {
  try {
    return JSON.parse(decode(encodedPayload))
  } catch {
    throw new AttachmentSignedUrlInvalidError()
  }
}

export function createAttachmentReadToken(
  input: {
    attachmentId: string
    disposition: AttachmentDisposition
    expiresAt: Date
  },
  secret: string,
) {
  const payload: TokenPayload = {
    attachmentId: input.attachmentId,
    disposition: input.disposition,
    expiresAt: input.expiresAt.toISOString(),
  }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = signPayload(encodedPayload, secret)

  return `${encodedPayload}.${signature}`
}

export function verifyAttachmentReadToken(
  token: string,
  options: {
    attachmentId: string
    now: Date
    secret: string
  },
) {
  const parts = token.split('.')

  if (parts.length !== 2) {
    throw new AttachmentSignedUrlInvalidError()
  }

  const [encodedPayload, signature] = parts

  if (!encodedPayload || !signature) {
    throw new AttachmentSignedUrlInvalidError()
  }

  const expectedSignature = signPayload(encodedPayload, options.secret)

  if (!signaturesMatch(signature, expectedSignature)) {
    throw new AttachmentSignedUrlInvalidError()
  }

  const result = tokenPayloadSchema.safeParse(parsePayload(encodedPayload))

  if (!result.success || result.data.attachmentId !== options.attachmentId) {
    throw new AttachmentSignedUrlInvalidError()
  }

  const expiresAt = new Date(result.data.expiresAt)

  if (expiresAt.getTime() <= options.now.getTime()) {
    throw new AttachmentSignedUrlInvalidError()
  }

  return {
    attachmentId: result.data.attachmentId,
    disposition: result.data.disposition,
    expiresAt,
  }
}
