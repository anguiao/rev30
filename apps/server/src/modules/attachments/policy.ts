import { extname } from 'node:path'
import bytes from 'bytes'
import { lookup } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  type AttachmentDisposition,
} from '@rev30/contracts'
import { AttachmentFileTooLargeError, AttachmentTypeUnsupportedError } from './errors'

export const ATTACHMENT_MAX_SIZE_BYTES = bytes.parse('20MB')!
export const ATTACHMENT_MAX_SIZE_MESSAGE = `文件大小不能超过 ${bytes.format(ATTACHMENT_MAX_SIZE_BYTES)!}`

const supportedUploadMimeTypes = new Set([
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

const textFallbackMimeTypes: Record<string, string> = {
  txt: 'text/plain',
  csv: 'text/csv',
}

export type AttachmentFileType = {
  extension: string
  mimeType: string
}

export function getAttachmentFilenameType(originalName: string): AttachmentFileType | null {
  const extension = extensionFromName(originalName)
  const mimeType = mimeTypeFromExtension(extension)

  if (!mimeType || !isSupportedUploadMime(mimeType)) {
    return null
  }

  return {
    extension,
    mimeType,
  }
}

export function acceptAttachmentUploadType(
  filenameType: AttachmentFileType | null,
  detectedType: AttachmentFileType | null,
): AttachmentFileType {
  if (detectedType) {
    validateAttachmentUploadMimeType(detectedType.mimeType)
    const detectedExtension = normalizeExtension(detectedType.extension)

    return {
      extension: detectedExtension,
      mimeType: detectedType.mimeType,
    }
  }

  if (!filenameType) {
    throw new AttachmentTypeUnsupportedError()
  }

  const textFallbackMimeType = textFallbackMimeTypes[filenameType.extension]

  if (!textFallbackMimeType) {
    throw new AttachmentTypeUnsupportedError()
  }

  return {
    extension: filenameType.extension,
    mimeType: textFallbackMimeType,
  }
}

export function validateAttachmentUploadMimeType(mimeType: string) {
  if (!isSupportedUploadMime(mimeType)) {
    throw new AttachmentTypeUnsupportedError()
  }
}

export function validateAttachmentUploadSize(size: number) {
  if (size > ATTACHMENT_MAX_SIZE_BYTES) {
    throw new AttachmentFileTooLargeError(ATTACHMENT_MAX_SIZE_MESSAGE)
  }
}

export function resolveContentDisposition(
  requested: AttachmentDisposition,
  mimeType: string,
): AttachmentDisposition {
  if (requested !== ATTACHMENT_DISPOSITION_INLINE) {
    return ATTACHMENT_DISPOSITION_ATTACHMENT
  }

  if (isInlineAttachmentMime(mimeType)) {
    return ATTACHMENT_DISPOSITION_INLINE
  }

  return ATTACHMENT_DISPOSITION_ATTACHMENT
}

function isSupportedUploadMime(mimeType: string) {
  return isRasterImage(mimeType) || supportedUploadMimeTypes.has(mimeType)
}

function isInlineAttachmentMime(mimeType: string) {
  return isRasterImage(mimeType) || mimeType === 'application/pdf'
}

function isRasterImage(mimeType: string) {
  return mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
}

function extensionFromName(name: string) {
  return normalizeExtension(extname(name))
}

function normalizeExtension(extension: string) {
  return extension.replace(/^\./, '').trim().toLowerCase()
}

function mimeTypeFromExtension(extension: string) {
  const mimeType = textFallbackMimeTypes[extension] ?? lookup(extension)

  return mimeType || null
}
