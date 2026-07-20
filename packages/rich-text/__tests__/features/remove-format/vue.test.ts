import { describe, expect, it } from 'vitest'
import { runRichTextAction } from '../../../src/editor/action'
import { collectRichTextEditorExtensions } from '../../../src/editor/feature'
import { removeFormatAction } from '../../../src/features/remove-format/editor'
import { createAllRichTextEditorPreset } from '../../../src/vue/presets/all'
import { createTestEditor } from '../../helpers/editor'

const preset = createAllRichTextEditorPreset({
  image: {
    upload: async () => ({ src: '/api/attachments/image/content' }),
  },
})

function collectExtensions() {
  return collectRichTextEditorExtensions(preset)
}

function createEditor() {
  return createTestEditor({
    extensions: collectExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [
            {
              type: 'text',
              text: '维护通知',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'underline' },
                { type: 'strike' },
                { type: 'highlight', attrs: { color: 'rgba(250, 204, 21, 0.35)' } },
                { type: 'link', attrs: { href: 'https://rev30.example/docs' } },
              ],
            },
          ],
        },
      ],
    },
  })
}

describe('remove format command', () => {
  it('removes inline marks without changing block structure', () => {
    const editor = createEditor()

    editor.commands.selectAll()

    expect(runRichTextAction(editor, removeFormatAction)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '维护通知' }],
        },
      ],
    })
    expect(JSON.stringify(editor.getJSON())).not.toContain('"marks"')
  })

  it('preserves nested list and blockquote structure', () => {
    const editor = createTestEditor({
      extensions: collectExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: '维护通知',
                            marks: [{ type: 'bold' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    editor.commands.selectAll()

    expect(runRichTextAction(editor, removeFormatAction)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '维护通知' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(editor.getJSON())).not.toContain('"marks"')
  })
})
