import { extname } from 'node:path'
import { fileTypeFromBuffer } from 'file-type'
import { lookup } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
  type AttachmentDisposition,
  type AttachmentUsage,
} from '@rev30/contracts'
import { AttachmentFileTooLargeError, AttachmentTypeUnsupportedError } from './errors'

const generalMaxSize = 20 * 1024 * 1024
const imageMaxSize = 5 * 1024 * 1024

const generalAllowedMimes = new Set([
  'application/pdf',
  'application/zip',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const blockedMimes = new Set([
  'image/svg+xml',
  'text/html',
  'application/xml',
  'text/xml',
  'application/xhtml+xml',
])

export type DetectedAttachmentType = {
  extension: string
  mimeType: string
}

function normalizeExtension(extension: string) {
  return extension.replace(/^\./, '').trim().toLowerCase()
}

function extensionFromName(name: string) {
  return normalizeExtension(extname(name))
}

function isRasterImage(mimeType: string) {
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
}

function isGeneralAllowed(mimeType: string) {
  return isRasterImage(mimeType) || generalAllowedMimes.has(mimeType)
}

export async function detectAttachmentFileType(
  prefix: Uint8Array,
  originalName: string,
): Promise<DetectedAttachmentType> {
  const detected = await fileTypeFromBuffer(prefix)

  if (detected) {
    return {
      extension: detected.ext,
      mimeType: detected.mime,
    }
  }

  const mimeType = lookup(originalName)
  const extension = extensionFromName(originalName)

  if (!mimeType || !extension) {
    throw new AttachmentTypeUnsupportedError()
  }

  return {
    extension,
    mimeType: mimeType.toString(),
  }
}

export function validateAttachmentUpload(input: {
  usage: AttachmentUsage
  mimeType: string
  size: number
}) {
  if (input.usage === ATTACHMENT_USAGE_GENERAL && input.size > generalMaxSize) {
    throw new AttachmentFileTooLargeError('文件大小不能超过 20MB')
  }

  if (
    (input.usage === ATTACHMENT_USAGE_AVATAR || input.usage === ATTACHMENT_USAGE_RICH_TEXT) &&
    input.size > imageMaxSize
  ) {
    throw new AttachmentFileTooLargeError('图片不能超过 5MB')
  }

  if (blockedMimes.has(input.mimeType)) {
    throw new AttachmentTypeUnsupportedError()
  }

  if (input.usage === ATTACHMENT_USAGE_GENERAL && isGeneralAllowed(input.mimeType)) {
    return
  }

  if (
    (input.usage === ATTACHMENT_USAGE_AVATAR || input.usage === ATTACHMENT_USAGE_RICH_TEXT) &&
    isRasterImage(input.mimeType)
  ) {
    return
  }

  throw new AttachmentTypeUnsupportedError()
}

export function resolveContentDisposition(
  requested: AttachmentDisposition,
  mimeType: string,
): AttachmentDisposition {
  if (requested !== ATTACHMENT_DISPOSITION_INLINE) {
    return ATTACHMENT_DISPOSITION_ATTACHMENT
  }

  if (isRasterImage(mimeType) || mimeType === 'application/pdf') {
    return ATTACHMENT_DISPOSITION_INLINE
  }

  return ATTACHMENT_DISPOSITION_ATTACHMENT
}
