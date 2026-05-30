import { describe, expect, it } from 'vitest'
import { ATTACHMENT_DISPOSITION_ATTACHMENT, ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import {
  ATTACHMENT_MAX_SIZE_BYTES,
  ATTACHMENT_MAX_SIZE_MESSAGE,
  resolveAttachmentFileType,
  resolveContentDisposition,
  validateAttachmentUploadMimeType,
  validateAttachmentUploadSize,
} from '../../../src/modules/attachments/policy'

describe('attachment policy', () => {
  it('uses detected binary file types', () => {
    expect(resolveAttachmentFileType({ ext: 'png', mime: 'image/png' }, 'avatar.bin')).toEqual({
      extension: 'png',
      mimeType: 'image/png',
    })
    expect(
      resolveAttachmentFileType({ ext: 'pdf', mime: 'application/pdf' }, 'document.bin'),
    ).toEqual({
      extension: 'pdf',
      mimeType: 'application/pdf',
    })
  })

  it('falls back to filename lookup for text-like files', () => {
    expect(resolveAttachmentFileType(undefined, 'users.csv')).toEqual({
      extension: 'csv',
      mimeType: 'text/csv',
    })
    expect(resolveAttachmentFileType(undefined, 'notes.txt')).toEqual({
      extension: 'txt',
      mimeType: 'text/plain',
    })
  })

  it('rejects unknown binary document extensions', () => {
    expect(() => resolveAttachmentFileType(undefined, 'report.docx')).toThrow('不支持的文件类型')
    expect(() => resolveAttachmentFileType(undefined, 'archive.zip')).toThrow('不支持的文件类型')
    expect(() => resolveAttachmentFileType(undefined, 'file.pdf')).toThrow('不支持的文件类型')
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
