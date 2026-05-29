import { describe, expect, it } from 'vitest'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import {
  createAttachmentReadToken,
  verifyAttachmentReadToken,
} from '../../../src/modules/attachments/signing'

const secret = 'test-attachment-signing-secret'
const attachmentId = '11111111-1111-4111-8111-111111111111'

describe('attachment signing', () => {
  it('creates and verifies signed attachment read tokens', () => {
    const token = createAttachmentReadToken(
      {
        attachmentId,
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        expiresAt: new Date('2026-05-29T00:05:00.000Z'),
      },
      secret,
    )

    expect(
      verifyAttachmentReadToken(token, {
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
    const token = createAttachmentReadToken(
      {
        attachmentId,
        disposition: ATTACHMENT_DISPOSITION_INLINE,
        expiresAt: new Date('2026-05-29T00:05:00.000Z'),
      },
      secret,
    )

    expect(() =>
      verifyAttachmentReadToken(token, {
        attachmentId,
        now: new Date('2026-05-29T00:05:01.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
    expect(() =>
      verifyAttachmentReadToken(token, {
        attachmentId: '22222222-2222-4222-8222-222222222222',
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
    expect(() =>
      verifyAttachmentReadToken(`${token}x`, {
        attachmentId,
        now: new Date('2026-05-29T00:04:00.000Z'),
        secret,
      }),
    ).toThrow('附件链接已失效')
  })
})
