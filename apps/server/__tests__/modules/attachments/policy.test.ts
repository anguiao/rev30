import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  ATTACHMENT_USAGE_RICH_TEXT,
} from '@rev30/contracts'
import {
  detectAttachmentFileType,
  resolveContentDisposition,
  validateAttachmentUpload,
} from '../../../src/modules/attachments/policy'

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
])
const pdfBytes = new TextEncoder().encode('%PDF-1.7\n')
const plainBytes = new TextEncoder().encode('name,email\nAda,ada@example.com\n')
const unknownBytes = new Uint8Array([0x00, 0x7f, 0x80, 0x2a, 0xff, 0x10])

describe('attachment policy', () => {
  it('detects binary files by magic bytes', async () => {
    await expect(detectAttachmentFileType(pngBytes, 'avatar.bin')).resolves.toMatchObject({
      extension: 'png',
      mimeType: 'image/png',
    })
    await expect(detectAttachmentFileType(pdfBytes, 'document.bin')).resolves.toMatchObject({
      extension: 'pdf',
      mimeType: 'application/pdf',
    })
  })

  it('falls back to filename lookup for text-like files', async () => {
    await expect(detectAttachmentFileType(plainBytes, 'users.csv')).resolves.toMatchObject({
      extension: 'csv',
      mimeType: 'text/csv',
    })
  })

  it('rejects unknown bytes disguised as binary document extensions', async () => {
    await expect(detectAttachmentFileType(unknownBytes, 'report.docx')).rejects.toThrow(
      '不支持的文件类型',
    )
    await expect(detectAttachmentFileType(unknownBytes, 'archive.zip')).rejects.toThrow(
      '不支持的文件类型',
    )
    await expect(detectAttachmentFileType(unknownBytes, 'file.pdf')).rejects.toThrow(
      '不支持的文件类型',
    )
  })

  it('rejects risky markup content disguised as text-like files', async () => {
    await expect(
      detectAttachmentFileType(new TextEncoder().encode('  <html><body>x</body></html>'), 'x.txt'),
    ).rejects.toThrow('不支持的文件类型')
    await expect(
      detectAttachmentFileType(new TextEncoder().encode('\n<?xml version="1.0"?>'), 'x.csv'),
    ).rejects.toThrow('不支持的文件类型')
    await expect(
      detectAttachmentFileType(
        new TextEncoder().encode('\t<svg xmlns="http://www.w3.org/2000/svg">'),
        'x.txt',
      ),
    ).rejects.toThrow('不支持的文件类型')
  })

  it('validates upload limits by usage', () => {
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_GENERAL,
        mimeType: 'application/pdf',
        size: 20 * 1024 * 1024,
      }),
    ).not.toThrow()
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_AVATAR,
        mimeType: 'image/png',
        size: 5 * 1024 * 1024,
      }),
    ).not.toThrow()
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_RICH_TEXT,
        mimeType: 'image/png',
        size: 5 * 1024 * 1024 + 1,
      }),
    ).toThrow('图片不能超过 5MB')
  })

  it('rejects svg and html uploads', () => {
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_AVATAR,
        mimeType: 'image/svg+xml',
        size: 1024,
      }),
    ).toThrow('不支持的文件类型')
    expect(() =>
      validateAttachmentUpload({
        usage: ATTACHMENT_USAGE_GENERAL,
        mimeType: 'text/html',
        size: 1024,
      }),
    ).toThrow('不支持的文件类型')
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
