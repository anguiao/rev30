import { describe, expect, it } from 'vitest'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import {
  createAttachmentContentToken,
  createAttachmentUploadToken,
  verifyAttachmentContentToken,
  verifyAttachmentUploadToken,
} from '../../../src/modules/attachments/signing'

const secret = 'test-attachment-signing-secret'
const attachmentId = '11111111-1111-4111-8111-111111111111'
const uploadId = '33333333-3333-4333-8333-333333333333'

describe('attachment signing', () => {
  it('creates and verifies attachment content tokens', () => {
    const token = createAttachmentContentToken(
      {
        attachmentId,
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        expiresAt: new Date('2026-05-29T00:05:00.000Z'),
      },
      secret,
    )

    expect(
      verifyAttachmentContentToken(token, {
        attachmentId,
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toEqual({
      attachmentId,
      disposition: ATTACHMENT_DISPOSITION_INLINE,
      expiresAt: new Date('2026-05-29T00:05:00.000Z'),
    })
  })

  it('rejects expired, mismatched, and tampered tokens', () => {
    const token = createAttachmentContentToken(
      {
        attachmentId,
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        expiresAt: new Date('2026-05-29T00:05:00.000Z'),
      },
      secret,
    )

    expect(() =>
      verifyAttachmentContentToken(token, {
        attachmentId,
        now: new Date('2026-05-29T00:05:01.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
    expect(() =>
      verifyAttachmentContentToken(token, {
        attachmentId: '22222222-2222-4222-8222-222222222222',
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
    expect(() =>
      verifyAttachmentContentToken(`${token}x`, {
        attachmentId,
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
  })

  it('creates and verifies upload tokens', () => {
    const token = createAttachmentUploadToken(
      {
        uploadId,
        expiresAt: new Date('2026-05-29T00:05:00.000Z'),
      },
      secret,
    )

    expect(
      verifyAttachmentUploadToken(token, {
        uploadId,
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toEqual({
      uploadId,
      expiresAt: new Date('2026-05-29T00:05:00.000Z'),
    })

    expect(() =>
      verifyAttachmentUploadToken(token, {
        uploadId,
        now: new Date('2026-05-29T00:05:00.000Z'),
        secret,
      }),
    ).toThrow('上传链接已失效')
  })
})
