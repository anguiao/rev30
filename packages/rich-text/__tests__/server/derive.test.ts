import { describe, expect, it, vi } from 'vitest'
import { RichTextContentInvalidError, deriveRichTextContent } from '../../src/server'
import { createCompactRichTextServerPreset } from '../../src/server/presets'

function createServerPreset() {
  return createCompactRichTextServerPreset({
    image: {
      isAllowedSrc: (src) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
    },
  })
}

describe('deriveRichTextContent', () => {
  it('uses the server tiptap html entry instead of the browser entry', async () => {
    vi.resetModules()
    const serverGenerateHtml = vi.fn(() => '<p>维护通知</p>')
    vi.doMock('@tiptap/html/server', () => ({ generateHTML: serverGenerateHtml }))

    try {
      const { deriveRichTextContent: deriveRichTextContentWithMock } =
        await import('../../src/server')

      expect(
        deriveRichTextContentWithMock(
          {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
          },
          createServerPreset(),
        ).html,
      ).toBe('<p>维护通知</p>')
      expect(serverGenerateHtml).toHaveBeenCalledOnce()
    } finally {
      vi.doUnmock('@tiptap/html/server')
      vi.resetModules()
    }
  })

  it('derives sanitized html from supported tiptap json', () => {
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
      createServerPreset(),
    )

    expect(content.text).toBe('维护通知\n\n请留意 发布时间\n\n更多内容见 文档')
    expect(content.html).toContain('<h2>维护通知</h2>')
    expect(content.html).toContain('<strong>发布时间</strong>')
    expect(content.html).toContain(
      '<a href="https://rev30.example/docs" target="_blank" rel="noopener noreferrer nofollow">文档</a>',
    )
  })

  it('derives html from media-only rich text content', () => {
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
      createServerPreset(),
    )

    expect(content.text).toBe('')
    expect(content.html).toContain(
      '<img src="/api/attachments/11111111-1111-4111-8111-111111111111/content" alt="示意图"',
    )
  })

  it('rejects unsupported node types', () => {
    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
        },
        createServerPreset(),
      ),
    ).toThrow(RichTextContentInvalidError)
  })
})
