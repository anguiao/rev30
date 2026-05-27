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
    const { compactRichTextServerPreset } = await import('../../src/server/presets')

    expect(
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
        },
        compactRichTextServerPreset,
      ).html,
    ).toBe('<p>维护通知</p>')
    expect(serverGenerateHtml).toHaveBeenCalledOnce()
  })

  it('derives sanitized html from supported tiptap json', async () => {
    const { deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextServerPreset } = await import('../../src/server/presets')

    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '维护通知' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '请留意 ' },
              { type: 'text', text: '发布时间', marks: [{ type: 'bold' }] },
            ],
          },
        ],
      },
      compactRichTextServerPreset,
    )

    expect(content.text).toBe('维护通知\n\n请留意 发布时间')
    expect(content.html).toContain('<h2>维护通知</h2>')
    expect(content.html).toContain('<strong>发布时间</strong>')
  })

  it('rejects empty and unsupported documents', async () => {
    const { RichTextContentInvalidError, deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextServerPreset } = await import('../../src/server/presets')

    expect(() =>
      deriveRichTextContent(
        { type: 'doc', content: [{ type: 'paragraph' }] },
        compactRichTextServerPreset,
      ),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
        },
        compactRichTextServerPreset,
      ),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '链接', marks: [{ type: 'link' }] }],
            },
          ],
        },
        compactRichTextServerPreset,
      ),
    ).toThrow(RichTextContentInvalidError)
  })
})
