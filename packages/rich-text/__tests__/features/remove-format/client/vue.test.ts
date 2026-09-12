import { describe, expect, it } from 'vitest'
import { runRichTextAction } from '../../../../src/client/editor/action'
import { collectRichTextEditorExtensions } from '../../../../src/client/editor/feature'
import { removeFormatAction } from '../../../../src/features/remove-format/client/editor'
import { createAllRichTextEditorPreset } from '../../../../src/client/vue/presets/all'
import { createTestEditor } from '../../../helpers/editor'

const preset = createAllRichTextEditorPreset({
  image: {
    upload: async () => ({ src: '/api/attachments/image/content' }),
  },
})

function createEditor() {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(preset),
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
    expect(editor.getHTML()).toBe('<h2>维护通知</h2>')
  })

  it('preserves nested list and blockquote structure', () => {
    const editor = createTestEditor({
      extensions: collectRichTextEditorExtensions(preset),
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
    expect(editor.getHTML()).toBe('<blockquote><ul><li><p>维护通知</p></li></ul></blockquote>')
  })
})
