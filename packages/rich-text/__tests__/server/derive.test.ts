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
    const { createCompactRichTextServerPreset } = await import('../../src/server/presets')
    const compactServerPreset = createCompactRichTextServerPreset({
      image: {
        isAllowedSrc: (src) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
      },
    })

    expect(
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
        },
        compactServerPreset,
      ).html,
    ).toBe('<p>维护通知</p>')
    expect(serverGenerateHtml).toHaveBeenCalledOnce()
  })

  it('derives sanitized html from supported tiptap json', async () => {
    const { deriveRichTextContent } = await loadServerHelpers()
    const { createCompactRichTextServerPreset } = await import('../../src/server/presets')
    const compactServerPreset = createCompactRichTextServerPreset({
      image: {
        isAllowedSrc: (src) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
      },
    })

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
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '更多内容见 ' },
              {
                type: 'text',
                text: '文档',
                marks: [{ type: 'link', attrs: { href: 'https://rev30.example/docs' } }],
              },
            ],
          },
        ],
      },
      compactServerPreset,
    )

    expect(content.text).toBe('维护通知\n\n请留意 发布时间\n\n更多内容见 文档')
    expect(content.html).toContain('<h2>维护通知</h2>')
    expect(content.html).toContain('<strong>发布时间</strong>')
    expect(content.html).toContain(
      '<a href="https://rev30.example/docs" target="_blank" rel="noopener noreferrer nofollow">文档</a>',
    )
  })

  it('derives html from media-only rich text content', async () => {
    const { deriveRichTextContent } = await loadServerHelpers()
    const { createCompactRichTextServerPreset } = await import('../../src/server/presets')
    const compactServerPreset = createCompactRichTextServerPreset({
      image: {
        isAllowedSrc: (src) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
      },
    })

    const content = deriveRichTextContent(
      {
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
      },
      compactServerPreset,
    )

    expect(content.text).toBe('')
    expect(content.html).toContain(
      '<img src="/api/attachments/11111111-1111-4111-8111-111111111111/content" alt="示意图"',
    )
  })

  it('rejects unsupported node types', async () => {
    const { RichTextContentInvalidError, deriveRichTextContent } = await loadServerHelpers()
    const { createCompactRichTextServerPreset } = await import('../../src/server/presets')
    const compactServerPreset = createCompactRichTextServerPreset({
      image: {
        isAllowedSrc: (src) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
      },
    })

    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
        },
        compactServerPreset,
      ),
    ).toThrow(RichTextContentInvalidError)
  })
})
