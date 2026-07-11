import { describe, expect, it } from 'vitest'
import { deriveAnnouncementContent } from '../../../../src/modules/content/announcements/content'
import { AnnouncementContentInvalidError } from '../../../../src/modules/content/announcements/errors'

describe('announcement content helpers', () => {
  it('maps compact rich text json into derived announcement content', () => {
    expect(
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [
              { type: 'text', marks: [{ type: 'bold' }, { type: 'italic' }], text: '维护通知' },
            ],
          },
        ],
      }),
    ).toEqual({
      json: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [
              { type: 'text', marks: [{ type: 'bold' }, { type: 'italic' }], text: '维护通知' },
            ],
          },
        ],
      },
      text: '维护通知',
      html: '<h2><strong><em>维护通知</em></strong></h2>',
    })
  })

  it('maps unsupported all-preset features to announcement content errors', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src: 'data:image/png;base64,aGVsbG8=' },
          },
        ],
      }),
    ).toThrow(AnnouncementContentInvalidError)

    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', marks: [{ type: 'underline' }], text: '维护通知' }],
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
