import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'
import { canRunRichTextAction, runRichTextAction } from '../../../src/editor/action'
import {
  codeBlockAction,
  codeBlockEditorFeature,
  setCodeBlockLanguageAction,
} from '../../../src/features/code-block/editor'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string | object = '<p>const ready = true</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
    content,
  })
}

function handleEditorClick(editor: Editor, target: EventTarget, clientY: number) {
  const event = new MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientY,
  })

  target.dispatchEvent(event)

  return event.defaultPrevented
}

function setLastElementBottom(editor: Editor, bottom: number) {
  const lastElement = editor.view.dom.lastElementChild

  if (!lastElement) {
    throw new Error('Editor has no rendered document node')
  }

  lastElement.getBoundingClientRect = () => ({ bottom }) as DOMRect

  return lastElement
}

describe('code block feature', () => {
  it('toggles a basic code block and exposes its action state', () => {
    const editor = createEditor()

    expect(canRunRichTextAction(editor, codeBlockAction)).toBe(true)
    expect(runRichTextAction(editor, codeBlockAction)).toBe(true)
    expect(codeBlockAction.isActive?.(editor)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })
    const code = editor.view.dom.querySelector('pre.hljs > code')

    expect(code?.outerHTML).toBe('<code>const ready = true</code>')
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
  })

  it('keeps the native Mod-Alt-c shortcut', () => {
    const editor = createEditor()

    expect(editor.commands.keyboardShortcut('Mod-Alt-c')).toBe(true)
    expect(editor.isActive('codeBlock')).toBe(true)
  })

  it('keeps the native Backspace behavior at the start of a code block', () => {
    const editor = createEditor()

    expect(runRichTextAction(editor, codeBlockAction)).toBe(true)
    editor.commands.setTextSelection(1)

    expect(editor.commands.keyboardShortcut('Backspace')).toBe(true)
    expect(editor.isActive('codeBlock')).toBe(false)
  })

  it('creates a paragraph when clicking editor whitespace below the final code block', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })

    setLastElementBottom(editor, 100)

    expect(handleEditorClick(editor, editor.view.dom, 120)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const ready = true' }],
        },
        { type: 'paragraph' },
      ],
    })
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('ignores clicks that are not in whitespace below a trailing code block', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })
    const codeBlockElement = setLastElementBottom(editor, 100)

    expect(handleEditorClick(editor, editor.view.dom, 80)).toBe(false)
    expect(handleEditorClick(editor, codeBlockElement, 120)).toBe(false)
    expect(editor.getJSON().content).toHaveLength(1)

    const editorWithTrailingParagraph = createEditor({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
        { type: 'paragraph' },
      ],
    })

    setLastElementBottom(editorWithTrailingParagraph, 100)

    expect(
      handleEditorClick(editorWithTrailingParagraph, editorWithTrailingParagraph.view.dom, 120),
    ).toBe(false)
    expect(editorWithTrailingParagraph.getJSON().content).toHaveLength(2)
  })

  it('creates a code block with the selected language and updates it', () => {
    const editor = createEditor()

    expect(canRunRichTextAction(editor, setCodeBlockLanguageAction, 'typescript')).toBe(true)
    expect(runRichTextAction(editor, setCodeBlockLanguageAction, 'typescript')).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const')

    expect(runRichTextAction(editor, setCodeBlockLanguageAction, null)).toBe(true)
    expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: null })
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
  })
})
