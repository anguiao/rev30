import { describe, expect, it } from 'vitest'
import { deriveAnnouncementContent } from '../../../../src/modules/content/announcements/content'
import { AnnouncementContentInvalidError } from '../../../../src/modules/content/announcements/errors'

const firstAttachmentId = '11111111-1111-4111-8111-111111111111'
const secondAttachmentId = '22222222-2222-4222-8222-222222222222'

const compactAnnouncementFixture = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', marks: [{ type: 'bold' }, { type: 'italic' }], text: '维护通知' }],
    },
  ],
} as const

describe('announcement content helpers', () => {
  it('derives the frozen compact announcement fixture with the standard preset', () => {
    expect(deriveAnnouncementContent(compactAnnouncementFixture)).toMatchObject({
      json: compactAnnouncementFixture,
      text: '维护通知',
      html: '<h2><em><strong>维护通知</strong></em></h2>',
    })
  })

  it('derives standard-only formatting and extracts unique internal image attachment ids', () => {
    const content = deriveAnnouncementContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'underline' }], text: '标准公告正文' }],
        },
        {
          type: 'image',
          attrs: { src: `/api/attachments/${firstAttachmentId}/content` },
        },
        {
          type: 'image',
          attrs: { src: `/api/attachments/${secondAttachmentId}/content` },
        },
        {
          type: 'image',
          attrs: { src: `/api/attachments/${firstAttachmentId}/content` },
        },
      ],
    })

    expect(content.text).toBe('标准公告正文')
    expect(content.json).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [{ type: 'text', marks: [{ type: 'underline' }], text: '标准公告正文' }],
        },
        {
          type: 'image',
          attrs: {
            src: `/api/attachments/${firstAttachmentId}/content`,
            alt: null,
            width: null,
            height: null,
          },
        },
        {
          type: 'image',
          attrs: {
            src: `/api/attachments/${secondAttachmentId}/content`,
            alt: null,
            width: null,
            height: null,
          },
        },
        {
          type: 'image',
          attrs: {
            src: `/api/attachments/${firstAttachmentId}/content`,
            alt: null,
            width: null,
            height: null,
          },
        },
      ],
    })
    expect(content.html).toContain('<u>标准公告正文</u>')
    expect(content.html).toContain(`/api/attachments/${firstAttachmentId}/content`)
    expect(content.attachmentIds).toEqual([firstAttachmentId, secondAttachmentId])
  })

  it.each([
    'https://example.com/image.png',
    `//api/attachments/${firstAttachmentId}/content`,
    `data:image/png;base64,aGVsbG8=`,
    `blob:https://example.com/${firstAttachmentId}`,
    `/api/attachments/${firstAttachmentId}/content?download=1`,
    `/api/attachments/${firstAttachmentId}/content#preview`,
    ` /api/attachments/${firstAttachmentId}/content`,
    `/api/attachments/${firstAttachmentId}/content `,
    `/api/attachments/${firstAttachmentId}/content/extra`,
    '/api/attachments/not-a-uuid/content',
  ])('rejects invalid announcement image source %s', (src) => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src },
          },
        ],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })

  it('maps unsupported all-preset features to announcement content errors', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            content: [{ type: 'text', text: '维护通知' }],
          },
        ],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })

  it('maps malformed rich text content to announcement content errors', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })
})
