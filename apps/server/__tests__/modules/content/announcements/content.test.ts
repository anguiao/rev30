import { describe, expect, it } from 'vitest'
import {
  AnnouncementContentInvalidError,
  AnnouncementEmptyContentError,
} from '../../../../src/modules/content/announcements/errors'
import { deriveAnnouncementContentText } from '../../../../src/modules/content/announcements/content'

describe('announcement content helpers', () => {
  it('derives plain text from Tiptap JSON with block separators', () => {
    expect(
      deriveAnnouncementContentText({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '维护通知' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '今晚 22:00 开始维护' }] },
        ],
      }),
    ).toBe('维护通知\n\n今晚 22:00 开始维护')
  })

  it('rejects empty documents', () => {
    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }),
    ).toThrow(AnnouncementEmptyContentError)
  })

  it('rejects documents that do not match enabled extensions', () => {
    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })
})
