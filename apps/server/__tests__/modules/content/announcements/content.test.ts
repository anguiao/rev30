import { describe, expect, it } from 'vitest'
import {
  deriveAnnouncementContent,
  extractAnnouncementAttachmentIds,
} from '../../../../src/modules/content/announcements/content'
import { AnnouncementContentInvalidError } from '../../../../src/modules/content/announcements/errors'

describe('announcement content helpers', () => {
  it('maps supported rich text json into derived announcement content', () => {
    expect(
      deriveAnnouncementContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
      }),
    ).toEqual({
      json: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: null },
            content: [{ type: 'text', text: '维护通知' }],
          },
        ],
      },
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

  it('allows image-only announcement content', () => {
    expect(
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
              alt: '示意图',
            },
          },
        ],
      }),
    ).toEqual({
      json: {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
              alt: '示意图',
              width: null,
              height: null,
            },
          },
        ],
      },
      text: '',
      html: '<img src="/api/attachments/11111111-1111-4111-8111-111111111111/content" alt="示意图" style="max-width:100%;height:auto" />',
    })
  })

  it('rejects attachment image sources with surrounding whitespace', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: ' /api/attachments/11111111-1111-4111-8111-111111111111/content ',
              alt: '示意图',
            },
          },
        ],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })

  it('allows attachment image UUID versions accepted by zod', () => {
    const src = '/api/attachments/018f6e6a-7a7b-7c7d-8e8f-111111111111/content'

    expect(
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] },
          {
            type: 'image',
            attrs: {
              src,
              alt: '示意图',
            },
          },
        ],
      }).html,
    ).toContain(`src="${src}"`)
  })

  it('rejects attachment image sources with invalid UUIDs', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] },
          {
            type: 'image',
            attrs: {
              src: '/api/attachments/not-a-uuid/content',
              alt: '示意图',
            },
          },
        ],
      }),
    ).toThrow(AnnouncementContentInvalidError)
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

  it('extracts unique authenticated attachment ids from image nodes', () => {
    expect(
      extractAnnouncementAttachmentIds({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
            },
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'image',
                attrs: {
                  src: '/api/attachments/22222222-2222-4222-8222-222222222222/content',
                },
              },
              {
                type: 'image',
                attrs: {
                  src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
                },
              },
            ],
          },
        ],
      }),
    ).toEqual(['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'])
  })
})
