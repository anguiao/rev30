import type { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/core/feature'
import { blockquoteEditorFeature } from '../../src/features/blockquote/editor'
import { blockquoteFeature } from '../../src/features/blockquote/core/feature'
import { codeBlockEditorFeature } from '../../src/features/code-block/editor'
import { codeBlockFeature } from '../../src/features/code-block/core/feature'
import { tableEditorFeature } from '../../src/features/table/editor'
import { tableFeature } from '../../src/features/table/core/feature'
import { registerRichTextSlashMenu } from '../../src/vue/slash-menu/plugin'
import { createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'slash-menu-test',
  features: [baseFeature, blockquoteFeature, codeBlockFeature],
})

type SlashMenuRenderer = Parameters<typeof registerRichTextSlashMenu>[1]

function createEditor(content = '<p></p>', renderer: SlashMenuRenderer = {}) {
  const editor = createTestEditor({
    extensions: collectRichTextEditorExtensions({
      ...preset,
      editorFeatures: [baseEditorFeature, blockquoteEditorFeature, codeBlockEditorFeature],
    }),
    content,
  })

  registerRichTextSlashMenu(editor, renderer, document.body)

  return editor
}

function typeText(editor: Editor, text: string) {
  const { from, to } = editor.state.selection

  editor.view.dispatch(editor.state.tr.insertText(text, from, to))
}

describe('slash menu input', () => {
  it('hints at slash commands in the active top-level empty paragraph', async () => {
    const editor = createEditor('<p>Existing paragraph</p>')

    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.splitBlock()

    const paragraph = editor.view.dom.querySelectorAll('p').item(1)
    expect(paragraph.classList.contains('rich-text-slash-menu-placeholder')).toBe(true)
    expect(paragraph.dataset.placeholder).toBe('开始输入，或按 / 唤起命令')
    expect(JSON.stringify(editor.getJSON())).not.toContain('开始输入，或按 / 唤起命令')

    typeText(editor, 'Content')
    expect(paragraph.classList.contains('rich-text-slash-menu-placeholder')).toBe(false)

    editor.commands.setContent('<blockquote><p></p></blockquote>')
    expect(editor.view.dom.querySelector('.rich-text-slash-menu-placeholder')).toBeNull()

    editor.commands.setContent('<p></p>')
    editor.setEditable(false)

    await vi.waitFor(() => {
      expect(editor.view.dom.querySelector('.rich-text-slash-menu-placeholder')).toBeNull()
    })
  })

  it('starts from a slash at the start of a top-level paragraph', async () => {
    const onStart = vi.fn()
    const editor = createEditor('<p></p>', { onStart })

    typeText(editor, '/')

    await vi.waitFor(() => expect(onStart).toHaveBeenCalledOnce())
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      query: '',
      text: '/',
      range: { from: 1, to: 2 },
    })
  })

  it.each([
    ['a blockquote', '<blockquote><p></p></blockquote>'],
    ['a code block', '<pre><code></code></pre>'],
  ])(
    'does not start inside %s while keeping ordinary slash input intact',
    async (_name, content) => {
      const onStart = vi.fn()
      const editor = createEditor(content, { onStart })

      typeText(editor, '/')

      await Promise.resolve()
      expect(editor.getText()).toContain('/')
      expect(onStart).not.toHaveBeenCalled()
    },
  )

  it('keeps a session synchronized with matching document replacements', async () => {
    const onUpdate = vi.fn()
    const editor = createEditor('<p></p>', { onUpdate })

    typeText(editor, '/')
    typeText(editor, 'H1')

    await vi.waitFor(() => {
      expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({
        query: 'H1',
        text: '/H1',
      })
    })

    editor.commands.setContent('<p>/external</p>')

    await vi.waitFor(() => {
      expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({
        query: 'external',
        text: '/external',
      })
    })
  })

  it('updates a session on Backspace and closes on the first non-composition space', async () => {
    const onUpdate = vi.fn()
    const onExit = vi.fn()
    const editor = createEditor('<p></p>', { onUpdate, onExit })

    typeText(editor, '/')
    typeText(editor, 'none')

    const backspace = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(backspace, 'keyCode', { value: 8 })
    editor.view.dom.dispatchEvent(backspace)
    await Promise.resolve()

    const { from } = editor.state.selection
    editor.view.dispatch(editor.state.tr.delete(from - 1, from))

    await vi.waitFor(() => {
      expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({ query: 'non' })
    })

    typeText(editor, ' ')

    await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce())
    expect(editor.getText()).toBe('/non ')
  })

  it('keeps composition spaces inside the active session until composition ends', async () => {
    const onUpdate = vi.fn()
    const onExit = vi.fn()
    const editor = createEditor('<p></p>', { onUpdate, onExit })

    editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    typeText(editor, '/')
    typeText(editor, '命令 ')

    await vi.waitFor(() => {
      expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({ query: '命令 ' })
    })
    expect(onExit).not.toHaveBeenCalled()

    editor.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

    await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce())
    expect(editor.getText()).toBe('/命令 ')
  })

  it('starts from matching command and paste transactions', async () => {
    const commandStart = vi.fn()
    const commandEditor = createEditor('<p></p>', { onStart: commandStart })

    commandEditor.commands.insertContent('/')
    await vi.waitFor(() => expect(commandStart).toHaveBeenCalledOnce())

    const pasteStart = vi.fn()
    const pasteEditor = createEditor('<p></p>', { onStart: pasteStart })

    pasteEditor.view.dispatch(pasteEditor.state.tr.insertText('/').setMeta('uiEvent', 'paste'))
    await vi.waitFor(() => expect(pasteStart).toHaveBeenCalledOnce())
  })

  it.each([
    ['a table header', true],
    ['a table cell', false],
  ])(
    'does not start inside %s while keeping ordinary slash input intact',
    async (_name, withHeaderRow) => {
      const tablePreset = defineRichTextPreset({
        key: 'slash-table-test',
        features: [baseFeature, tableFeature],
      })
      const onStart = vi.fn()
      const editor = createTestEditor({
        extensions: collectRichTextEditorExtensions({
          ...tablePreset,
          editorFeatures: [baseEditorFeature, tableEditorFeature],
        }),
        content: '<p></p>',
      })

      registerRichTextSlashMenu(editor, { onStart }, document.body)
      editor.commands.insertTable({ rows: 1, cols: 1, withHeaderRow })
      editor.commands.insertContent('/')

      await Promise.resolve()
      expect(editor.getText()).toContain('/')
      expect(onStart).not.toHaveBeenCalled()
    },
  )
})
