import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'
import {
  codeBlockAction,
  codeBlockEditorFeature,
  setCodeBlockLanguageAction,
} from '../../../src/features/code-block/editor'
import { codeBlockFeature } from '../../../src/features/code-block/shared'
import { codeBlockToolbarControl } from '../../../src/features/code-block/vue'
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

    expect(codeBlockAction.canRun?.(editor)).toBe(true)
    expect(codeBlockAction.run(editor)).toBe(true)
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
    const code = editor.view.dom.querySelector('pre.rich-text-code-block > code')

    expect(code?.getAttribute('style')).toBe('padding: 0px; background: transparent;')
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
  })

  it('keeps the native Mod-Alt-c shortcut', () => {
    const editor = createEditor()

    expect(editor.commands.keyboardShortcut('Mod-Alt-c')).toBe(true)
    expect(editor.isActive('codeBlock')).toBe(true)
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

  it('stores the selected language and highlights the editable code', () => {
    const editor = createEditor()

    expect(setCodeBlockLanguageAction.canRun?.(editor, 'typescript')).toBe(false)
    expect(setCodeBlockLanguageAction.run(editor, 'typescript')).toBe(false)
    expect(codeBlockAction.run(editor)).toBe(true)
    expect(setCodeBlockLanguageAction.canRun?.(editor, 'typescript')).toBe(true)
    expect(setCodeBlockLanguageAction.run(editor, 'typescript')).toBe(true)
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

    expect(setCodeBlockLanguageAction.run(editor, null)).toBe(true)
    expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: null })
    expect(editor.view.dom.querySelector('.hljs-keyword')).toBeNull()
  })

  it('provides a split toolbar control for the feature', () => {
    const languageOptions = codeBlockToolbarControl.props.languages

    expect(languageOptions).toEqual([
      { label: '纯文本', value: 'plaintext' },
      { label: 'TypeScript / JavaScript', value: 'typescript' },
      { label: 'HTML', value: 'xml' },
      { label: 'CSS', value: 'css' },
      { label: 'Java', value: 'java' },
      { label: 'Python', value: 'python' },
      { label: 'Rust', value: 'rust' },
      { label: 'JSON', value: 'json' },
      { label: 'SQL', value: 'sql' },
      { label: 'Markdown', value: 'markdown' },
      { label: 'YAML', value: 'yaml' },
      { label: 'Bash', value: 'bash' },
    ])
    expect(codeBlockToolbarControl).toMatchObject({
      type: 'component',
      feature: codeBlockFeature,
      key: 'code-block',
      props: {
        languages: languageOptions,
      },
    })
    expect(codeBlockAction.feature).toBe(codeBlockToolbarControl.feature)
    expect(setCodeBlockLanguageAction.feature).toBe(codeBlockToolbarControl.feature)
  })
})
