import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadServerHelpers() {
  vi.resetModules()

  return await import('../../src/server')
}

afterEach(() => {
  vi.doUnmock('@tiptap/html')
  vi.doUnmock('@tiptap/html/server')
  vi.resetModules()
})

describe('deriveRichTextContent', () => {
  it('uses the server tiptap html entry instead of the browser entry', async () => {
    vi.resetModules()
    const serverGenerateHtml = vi.fn(() => '<p>维护通知</p>')
    vi.doMock('@tiptap/html/server', () => ({ generateHTML: serverGenerateHtml }))

    const { deriveRichTextContent } = await import('../../src/server')
    const { compactRichTextPreset } = await import('../../src/presets')

    expect(
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
        },
        { preset: compactRichTextPreset },
      ).html,
    ).toBe('<p>维护通知</p>')
    expect(serverGenerateHtml).toHaveBeenCalledOnce()
  })

  it('derives sanitized html from supported tiptap json', async () => {
    const { deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextPreset } = await import('../../src/presets')

    const content = deriveRichTextContent(
      {
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
      },
      { preset: compactRichTextPreset },
    )

    expect(content.text).toBe('维护通知\n\n请访问 帮助中心')
    expect(content.html).toContain('<h2>维护通知</h2>')
    expect(content.html).toContain('href="https://example.com/help"')
    expect(content.html).toContain('target="_blank"')
    expect(content.html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('removes unsafe link href protocols and normalizes target and rel', async () => {
    const { deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextPreset } = await import('../../src/presets')

    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '危险链接',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'javascript:alert(1)', target: '_self', rel: 'opener' },
                  },
                ],
              },
            ],
          },
        ],
      },
      { preset: compactRichTextPreset },
    )

    expect(content.html).toBe(
      '<p><a target="_blank" rel="noopener noreferrer nofollow">危险链接</a></p>',
    )
  })

  it('rejects empty and unsupported documents', async () => {
    const { RichTextContentInvalidError, deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextPreset } = await import('../../src/presets')

    expect(() =>
      deriveRichTextContent(
        { type: 'doc', content: [{ type: 'paragraph' }] },
        { preset: compactRichTextPreset },
      ),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
        },
        { preset: compactRichTextPreset },
      ),
    ).toThrow(RichTextContentInvalidError)
  })
})
