import type { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../../src/core/preset'
import { collectRichTextEditorExtensions } from '../../../src/editor/feature'
import { baseEditorFeature } from '../../../src/features/base/editor'
import { baseFeature } from '../../../src/features/base/shared'
import { blockquoteEditorFeature } from '../../../src/features/blockquote/editor'
import { blockquoteFeature } from '../../../src/features/blockquote/shared'
import {
  isRichTextSlashCommandActive,
  registerRichTextSlashCommandRenderer,
  slashCommandEditorFeature,
} from '../../../src/features/slash-command/editor'
import { slashCommandFeature } from '../../../src/features/slash-command/shared'
import { createTestEditor } from '../../helpers/editor'

const preset = defineRichTextPreset({
  key: 'slash-command-test',
  features: [baseFeature, blockquoteFeature, slashCommandFeature],
})

function createEditor(content = '<p></p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions({
      ...preset,
      editorFeatures: [baseEditorFeature, blockquoteEditorFeature, slashCommandEditorFeature],
    }),
    content,
  })
}

function typeText(editor: Editor, text: string) {
  const { from, to } = editor.state.selection

  editor.view.someProp('handleTextInput', (handler) =>
    handler(editor.view, from, to, text, () => editor.state.tr),
  )
  editor.view.dispatch(editor.state.tr.insertText(text, from, to))
}

describe('slash command editor feature', () => {
  it('is editor-only and installs the slash command extensions', () => {
    expect(slashCommandFeature).toMatchObject({
      key: 'slash-command',
      editorImplementation: true,
      serverImplementation: false,
    })
    expect(slashCommandFeature.documentExtensions).toBeUndefined()
    expect(slashCommandEditorFeature.extensions?.().map((extension) => extension.name)).toEqual([
      'placeholder',
      'richTextSlashCommand',
    ])
  })

  it('hints at slash commands in the active top-level empty paragraph', async () => {
    const editor = createEditor('<p>Existing paragraph</p>')

    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.splitBlock()

    const paragraph = editor.view.dom.querySelectorAll('p').item(1)
    expect(paragraph.classList.contains('rich-text-slash-command-placeholder')).toBe(true)
    expect(paragraph.dataset.placeholder).toBe('开始输入，或按 / 唤起命令')
    expect(JSON.stringify(editor.getJSON())).not.toContain('开始输入，或按 / 唤起命令')

    typeText(editor, 'Content')
    expect(paragraph.classList.contains('rich-text-slash-command-placeholder')).toBe(false)

    editor.commands.setContent('<blockquote><p></p></blockquote>')
    expect(editor.view.dom.querySelector('.rich-text-slash-command-placeholder')).toBeNull()

    editor.commands.setContent('<p></p>')
    editor.setEditable(false)

    await vi.waitFor(() => {
      expect(editor.view.dom.querySelector('.rich-text-slash-command-placeholder')).toBeNull()
    })
  })

  it('starts only from a directly typed slash at the start of a top-level paragraph', async () => {
    const editor = createEditor()
    const onStart = vi.fn()
    const unregister = registerRichTextSlashCommandRenderer(editor, { onStart })

    typeText(editor, '/')

    await vi.waitFor(() => expect(onStart).toHaveBeenCalledOnce())
    expect(isRichTextSlashCommandActive(editor)).toBe(true)
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      query: '',
      text: '/',
      range: { from: 1, to: 2 },
    })

    unregister()
  })

  it('keeps a direct session updated and closes it on an external document replacement', async () => {
    const editor = createEditor()
    const onUpdate = vi.fn()
    const onExit = vi.fn()

    registerRichTextSlashCommandRenderer(editor, { onUpdate, onExit })
    typeText(editor, '/')
    typeText(editor, 'H1')

    await vi.waitFor(() => {
      expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({
        query: 'H1',
        text: '/H1',
      })
    })

    editor.commands.setContent('<p>/external</p>')

    await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce())
    expect(isRichTextSlashCommandActive(editor)).toBe(false)
  })

  it('updates a direct session on Backspace and closes on the first non-composition space', async () => {
    const editor = createEditor()
    const onUpdate = vi.fn()
    const onExit = vi.fn()

    registerRichTextSlashCommandRenderer(editor, { onUpdate, onExit })
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
    expect(isRichTextSlashCommandActive(editor)).toBe(false)
  })

  it('keeps composition spaces inside the active session until composition ends', async () => {
    const editor = createEditor()
    const onUpdate = vi.fn()
    const onExit = vi.fn()

    registerRichTextSlashCommandRenderer(editor, { onUpdate, onExit })
    editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    typeText(editor, '/')
    typeText(editor, '命令 ')

    await vi.waitFor(() => {
      expect(onUpdate.mock.calls.at(-1)?.[0]).toMatchObject({ query: '命令 ' })
    })
    expect(isRichTextSlashCommandActive(editor)).toBe(true)
    expect(onExit).not.toHaveBeenCalled()

    editor.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

    await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce())
    expect(editor.getText()).toBe('/命令 ')
    expect(isRichTextSlashCommandActive(editor)).toBe(false)
  })

  it('does not start for commands, paste-like transactions, leading text, or replacement input', async () => {
    const editor = createEditor()
    const onStart = vi.fn()

    registerRichTextSlashCommandRenderer(editor, { onStart })

    editor.commands.insertContent('/')
    await Promise.resolve()
    expect(onStart).not.toHaveBeenCalled()

    editor.commands.setContent('<p></p>')
    editor.view.dispatch(editor.state.tr.insertText('/').setMeta('uiEvent', 'paste'))
    await Promise.resolve()
    expect(onStart).not.toHaveBeenCalled()

    editor.commands.setContent('<p></p>')
    typeText(editor, ' ')
    typeText(editor, '/')
    await Promise.resolve()
    expect(onStart).not.toHaveBeenCalled()

    editor.commands.setContent('<p>replace</p>')
    editor.commands.selectAll()
    typeText(editor, '/')
    await Promise.resolve()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('does not start inside a nested paragraph', async () => {
    const editor = createEditor('<blockquote><p></p></blockquote>')
    const onStart = vi.fn()

    registerRichTextSlashCommandRenderer(editor, { onStart })
    typeText(editor, '/')

    await Promise.resolve()
    expect(onStart).not.toHaveBeenCalled()
  })
})
