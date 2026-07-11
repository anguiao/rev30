import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { codeBlockAction } from '../../../src/features/code-block/editor'
import { codeBlockFeature } from '../../../src/features/code-block/shared'
import { codeBlockToolbarItem } from '../../../src/features/code-block/vue'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string | object = '<p>const ready = true</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...codeBlockFeature.documentExtensions!()],
    content,
  })
}

describe('code block feature', () => {
  it('toggles a basic code block and exposes its action state', () => {
    const editor = createEditor()

    expect(codeBlockAction.canRun?.(editor)).toBe(true)
    expect(codeBlockAction.run(editor)).toBe(true)
    expect(codeBlockAction.isActive?.(editor)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<pre><code>const ready = true</code></pre>')
  })

  it('keeps the native Mod-Alt-c shortcut', () => {
    const editor = createEditor()

    expect(editor.commands.keyboardShortcut('Mod-Alt-c')).toBe(true)
    expect(editor.isActive('codeBlock')).toBe(true)
  })

  it('drops unsupported language metadata from editor commands and json', () => {
    const editor = createEditor()

    expect(editor.commands.setCodeBlock({ language: 'typescript' })).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'const ready = true' }] }],
    })
    expect(editor.getJSON().content?.[0]).not.toHaveProperty('attrs')
    expect(editor.getHTML()).toBe('<pre><code>const ready = true</code></pre>')

    expect(
      editor.schema
        .nodeFromJSON({
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const ready = true' }],
        })
        .toJSON(),
    ).toEqual({
      type: 'codeBlock',
      content: [{ type: 'text', text: 'const ready = true' }],
    })
  })

  it('does not import language metadata from HTML', () => {
    const editor = createEditor(
      '<pre><code class="language-typescript">const ready = true</code></pre>',
    )

    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'codeBlock' }],
    })
    expect(editor.getJSON().content?.[0]).not.toHaveProperty('attrs')
  })

  it('provides the Chinese toolbar entry', () => {
    expect(codeBlockToolbarItem).toMatchObject({
      action: codeBlockAction,
      label: '代码块',
      icon: 'i-[lucide--square-code]',
    })
  })
})
