import { Editor } from '@tiptap/vue-3'
import { afterEach, describe, expect, it } from 'vitest'
import { collectRichTextExtensions } from '../../../src/core/preset'
import { removeFormatCommand } from '../../../src/features/remove-format/vue'
import { compactRichTextPreset } from '../../../src/presets'

const editors: Editor[] = []

function createEditor() {
  const element = document.createElement('div')
  document.body.appendChild(element)

  const editor = new Editor({
    element,
    extensions: collectRichTextExtensions(compactRichTextPreset),
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
  editors.push(editor)

  return editor
}

describe('remove format command', () => {
  afterEach(() => {
    document.body.innerHTML = ''

    while (editors.length > 0) {
      editors.pop()?.destroy()
    }
  })

  it('removes inline marks and resets text blocks', () => {
    const editor = createEditor()

    editor.commands.selectAll()

    expect(removeFormatCommand.run(editor)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '维护通知' }],
        },
      ],
    })
    expect(JSON.stringify(editor.getJSON())).not.toContain('"marks"')
  })
})
