import { describe, expect, it, vi } from 'vitest'
import { RichTextContentInvalidError, deriveRichTextContent } from '../../src/server'
import { createAllRichTextServerPreset } from '../../src/server/presets/all'

function createServerPreset() {
  return createAllRichTextServerPreset({
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

  it('returns schema-canonical json', () => {
    const content = deriveRichTextContent(
      {
        type: 'doc',
        attrs: { unsupported: 'root' },
        content: [
          {
            type: 'paragraph',
            attrs: { unsupported: 'paragraph' },
            content: [{ type: 'text', text: '维护通知' }],
          },
        ],
      },
      createServerPreset(),
    )

    expect(content.json).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [{ type: 'text', text: '维护通知' }],
        },
      ],
    })
  })

  it('preserves an isolated image height in json without rendering it to html', () => {
    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
              alt: '示意图',
              height: 360,
            },
          },
        ],
      },
      createServerPreset(),
    )

    expect(content.json).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            width: null,
            height: 360,
          },
        },
      ],
    })
    expect(content.html).not.toContain('height="360"')
  })

  it('uses tiptap text serializers for hard breaks', () => {
    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '第一行' },
              { type: 'hardBreak' },
              { type: 'text', text: '第二行' },
            ],
          },
        ],
      },
      createServerPreset(),
    )

    expect(content.text).toBe('第一行\n第二行')
  })

  it('accepts link href values that can be safely normalized', () => {
    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '文档',
                marks: [{ type: 'link', attrs: { href: 'example.com/docs' } }],
              },
            ],
          },
        ],
      },
      createServerPreset(),
    )

    expect(content.html).toContain('href="https://example.com/docs"')
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

  it.each([
    {
      name: 'a non-document root node',
      content: {
        type: 'paragraph',
        content: [{ type: 'text', text: 'x' }],
      },
    },
    {
      name: 'inline content directly under the document',
      content: {
        type: 'doc',
        content: [{ type: 'text', text: 'x' }],
      },
    },
    {
      name: 'block content inside a paragraph',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'x' }],
              },
            ],
          },
        ],
      },
    },
    {
      name: 'an invalid collection of marks',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [{ type: 'bold' }, { type: 'bold' }],
              },
            ],
          },
        ],
      },
    },
  ])('rejects $name', ({ content }) => {
    expect(() => deriveRichTextContent(content, createServerPreset())).toThrow(
      RichTextContentInvalidError,
    )
  })

  it.each([
    {
      name: 'a crafted text alignment',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: 'left;position:fixed;inset:0' },
            content: [{ type: 'text', text: 'x' }],
          },
        ],
      },
    },
    {
      name: 'a crafted highlight color',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [
                  {
                    type: 'highlight',
                    attrs: { color: 'red;background-image:url(https://example.com/x)' },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ])('rejects $name', ({ content }) => {
    expect(() => deriveRichTextContent(content, createServerPreset())).toThrow(
      RichTextContentInvalidError,
    )
  })
})
