import { describe, expect, it } from 'vitest'
import { deriveAnnouncementContent } from '../../../../src/modules/content/announcements/content'
import { AnnouncementContentInvalidError } from '../../../../src/modules/content/announcements/errors'

describe('announcement content helpers', () => {
  it('maps supported rich text json into derived announcement content', () => {
    expect(
      deriveAnnouncementContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
      }),
    ).toEqual({
      text: '维护通知',
      html: '<p>维护通知</p>',
    })
  })

  it('maps rich text invalid content errors to announcement content errors', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })

  it('allows authenticated attachment images in announcement content', () => {
    expect(
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] },
          {
            type: 'image',
            attrs: {
              src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
              alt: '示意图',
              width: 640,
              height: 360,
            },
          },
        ],
      }).html,
    ).toContain(
      '<img src="/api/attachments/11111111-1111-4111-8111-111111111111/content" alt="示意图" width="640" height="360" style="width:640px;max-width:100%;height:auto" />',
    )
  })

  it('rejects external announcement images', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] },
          {
            type: 'image',
            attrs: {
              src: 'https://example.com/image.png',
              alt: '外部图片',
              width: 640,
              height: 360,
            },
          },
        ],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })
})
