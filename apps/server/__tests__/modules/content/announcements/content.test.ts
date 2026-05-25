import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadContentHelpers() {
  vi.resetModules()

  const contentModule = await import('../../../../src/modules/content/announcements/content')
  const errorModule = await import('../../../../src/modules/content/announcements/errors')

  return {
    ...contentModule,
    ...errorModule,
  }
}

afterEach(() => {
  vi.doUnmock('@tiptap/html')
  vi.doUnmock('@tiptap/html/server')
  vi.resetModules()
})

describe('announcement content helpers', () => {
  it('uses the server tiptap html entry instead of the browser entry', async () => {
    vi.resetModules()
    const serverGenerateHtml = vi.fn(() => '<p>维护通知</p>')
    vi.doMock('@tiptap/html/server', () => {
      return {
        generateHTML: serverGenerateHtml,
      }
    })

    const { deriveAnnouncementContentHtml } = await import(
      '../../../../src/modules/content/announcements/content'
    )

    expect(
      deriveAnnouncementContentHtml({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
      }),
    ).toBe('<p>维护通知</p>')
    expect(serverGenerateHtml).toHaveBeenCalledOnce()
  })

  it('derives sanitized html from supported tiptap json', async () => {
    const {
      deriveAnnouncementContent,
      deriveAnnouncementContentHtml,
      deriveAnnouncementContentText,
    } = await loadContentHelpers()
    const contentJson = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '维护通知' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '请访问 ' },
            {
              type: 'text',
              text: '帮助中心',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/help' } }],
            },
          ],
        },
      ],
    }
    const content = deriveAnnouncementContent(contentJson)

    expect(content.text).toBe('维护通知\n\n请访问 帮助中心')
    expect(content.html).toContain('<h2>维护通知</h2>')
    expect(content.html).toContain('<a')
    expect(content.html).toContain('href="https://example.com/help"')
    expect(content.html).toContain('target="_blank"')
    expect(content.html).toContain('rel="noopener noreferrer nofollow"')

    const simpleContentJson = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
    }
    expect(deriveAnnouncementContentText(simpleContentJson)).toBe('维护通知')
    expect(deriveAnnouncementContentHtml(simpleContentJson)).toBe('<p>维护通知</p>')
  })

  it('preserves safe link attributes and removes unsafe href protocol', async () => {
    const { deriveAnnouncementContentHtml } = await loadContentHelpers()

    const unsafeLinkHtml = deriveAnnouncementContentHtml({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '危险链接',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    })

    expect(unsafeLinkHtml).toBe('<p><a target="_blank" rel="noopener noreferrer nofollow">危险链接</a></p>')
    expect(unsafeLinkHtml).not.toContain('href="javascript:alert(1)"')

    const safeLinkHtml = deriveAnnouncementContentHtml({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '安全链接',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://safe.example.com',
                    target: '_blank',
                    rel: 'noopener noreferrer nofollow',
                  },
                },
              ],
            },
          ],
        },
      ],
    })

    expect(safeLinkHtml).toContain('href="https://safe.example.com"')
    expect(safeLinkHtml).toContain('target="_blank"')
    expect(safeLinkHtml).toContain('rel="noopener noreferrer nofollow"')
  })

  it('normalizes unsafe link target and rel attribute values', async () => {
    const { deriveAnnouncementContentHtml } = await loadContentHelpers()

    const normalizedLinkHtml = deriveAnnouncementContentHtml({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '安全链接',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://safe.example.com',
                    target: '_self',
                    rel: 'opener',
                  },
                },
              ],
            },
          ],
        },
      ],
    })

    expect(normalizedLinkHtml).toContain('href="https://safe.example.com"')
    expect(normalizedLinkHtml).toContain('target="_blank"')
    expect(normalizedLinkHtml).toContain('rel="noopener noreferrer nofollow"')
    expect(normalizedLinkHtml).not.toContain('target="_self"')
    expect(normalizedLinkHtml).not.toContain('rel="opener"')
  })

  it('derives plain text from Tiptap JSON with block separators', async () => {
    const { deriveAnnouncementContentText } = await loadContentHelpers()

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

  it('rejects empty documents', async () => {
    const { AnnouncementEmptyContentError, deriveAnnouncementContentText } =
      await loadContentHelpers()

    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }),
    ).toThrow(AnnouncementEmptyContentError)
  })

  it('rejects documents that do not match enabled extensions', async () => {
    const { AnnouncementContentInvalidError, deriveAnnouncementContentText } =
      await loadContentHelpers()

    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })

  it('does not register duplicate tiptap extensions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await loadContentHelpers()

    expect(
      warnSpy.mock.calls.some(
        ([message]) =>
          typeof message === 'string' && message.includes('Duplicate extension names found'),
      ),
    ).toBe(false)

    warnSpy.mockRestore()
  })
})
