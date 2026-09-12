import { describe, expect, it } from 'vitest'
import { ATTACHMENT_DISPOSITION_ATTACHMENT, ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import {
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_MAX_SIZE_MESSAGE,
  acceptAttachmentUploadType,
  getAttachmentFilenameType,
  resolveContentDisposition,
  validateAttachmentUploadMimeType,
  validateAttachmentUploadSize,
} from '../../../src/modules/attachments/policy'

describe('attachment policy', () => {
  it('resolves filename file types from normalized extensions', () => {
    expect(getAttachmentFilenameType('Avatar.JPEG')).toEqual({
      extension: 'jpeg',
      mimeType: 'image/jpeg',
    })
    expect(getAttachmentFilenameType('report.PDF')).toEqual({
      extension: 'pdf',
      mimeType: 'application/pdf',
    })
  })

  it('uses detected MIME types and extensions', () => {
    expect(
      acceptAttachmentUploadType(getAttachmentFilenameType('avatar.png'), {
        extension: 'png',
        mimeType: 'image/png',
      }),
    ).toEqual({
      extension: 'png',
      mimeType: 'image/png',
    })
    expect(
      acceptAttachmentUploadType(getAttachmentFilenameType('avatar.jpeg'), {
        extension: 'jpg',
        mimeType: 'image/jpeg',
      }),
    ).toEqual({
      extension: 'jpg',
      mimeType: 'image/jpeg',
    })
    expect(
      acceptAttachmentUploadType(getAttachmentFilenameType('document.pdf'), {
        extension: 'pdf',
        mimeType: 'application/pdf',
      }),
    ).toEqual({ extension: 'pdf', mimeType: 'application/pdf' })
  })

  it('uses detected extensions when detected MIME does not match the filename extension', () => {
    expect(
      acceptAttachmentUploadType(getAttachmentFilenameType('avatar.png'), {
        extension: 'jpg',
        mimeType: 'image/jpeg',
      }),
    ).toEqual({
      extension: 'jpg',
      mimeType: 'image/jpeg',
    })
    expect(
      acceptAttachmentUploadType(getAttachmentFilenameType('avatar.jpeg'), {
        extension: 'png',
        mimeType: 'image/png',
      }),
    ).toEqual({
      extension: 'png',
      mimeType: 'image/png',
    })
    expect(
      acceptAttachmentUploadType(getAttachmentFilenameType('avatar.bin'), {
        extension: 'png',
        mimeType: 'image/png',
      }),
    ).toEqual({
      extension: 'png',
      mimeType: 'image/png',
    })
  })

  it('falls back to filename lookup for text-like files', () => {
    expect(acceptAttachmentUploadType(getAttachmentFilenameType('users.csv'), null)).toEqual({
      extension: 'csv',
      mimeType: 'text/csv',
    })
    expect(acceptAttachmentUploadType(getAttachmentFilenameType('notes.txt'), null)).toEqual({
      extension: 'txt',
      mimeType: 'text/plain',
    })
  })

  it('rejects unknown binary document extensions', () => {
    expect(getAttachmentFilenameType('report.docx')).toEqual({
      extension: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(() =>
      acceptAttachmentUploadType(getAttachmentFilenameType('report.docx'), null),
    ).toThrow('不支持的文件类型')
    expect(() =>
      acceptAttachmentUploadType(getAttachmentFilenameType('archive.zip'), null),
    ).toThrow('不支持的文件类型')
    expect(() => acceptAttachmentUploadType(getAttachmentFilenameType('file.pdf'), null)).toThrow(
      '不支持的文件类型',
    )
    expect(getAttachmentFilenameType('avatar.bin')).toBeNull()
  })

  it('validates upload limits globally', () => {
    expect(() => validateAttachmentUploadSize(ATTACHMENT_MAX_SIZE_BYTES)).not.toThrow()
    expect(() => validateAttachmentUploadSize(ATTACHMENT_MAX_SIZE_BYTES + 1)).toThrow(
      ATTACHMENT_MAX_SIZE_MESSAGE,
    )
  })

  it('rejects svg and html uploads', () => {
    expect(() => validateAttachmentUploadMimeType('image/svg+xml')).toThrow('不支持的文件类型')
    expect(() => validateAttachmentUploadMimeType('text/html')).toThrow('不支持的文件类型')
  })

  it('allows inline only for raster images and PDF files', () => {
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'image/png')).toBe(
      ATTACHMENT_DISPOSITION_INLINE,
    )
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'application/pdf')).toBe(
      ATTACHMENT_DISPOSITION_INLINE,
    )
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'image/svg+xml')).toBe(
      ATTACHMENT_DISPOSITION_ATTACHMENT,
    )
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'text/plain')).toBe(
      ATTACHMENT_DISPOSITION_ATTACHMENT,
    )
    expect(resolveContentDisposition(ATTACHMENT_DISPOSITION_INLINE, 'text/csv')).toBe(
      ATTACHMENT_DISPOSITION_ATTACHMENT,
    )
  })
})
