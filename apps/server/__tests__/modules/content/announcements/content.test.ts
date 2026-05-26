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
})
