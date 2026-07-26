import { mergeAttributes } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Plugin, TextSelection, type Selection } from '@tiptap/pm/state'
import { common, createLowlight } from 'lowlight'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { createCodeBlockLanguageAttribute } from './languages'
import { codeBlockFeature, richTextCodeBlockCodeStyle } from './shared'

const codeBlockLowlight = createLowlight(common)
// Keep missing or unsupported languages unhighlighted instead of auto-detecting them.
codeBlockLowlight.highlightAuto = (value) => codeBlockLowlight.highlight('plaintext', value)

export function getSelectedCodeBlock(selection: Selection) {
  if (
    !(selection instanceof TextSelection) ||
    selection.$from.parent.type.name !== 'codeBlock' ||
    !selection.$from.sameParent(selection.$to)
  ) {
    return null
  }

  return {
    position: selection.$from.before(),
    node: selection.$from.parent,
  }
}

const RichTextCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return { language: createCodeBlockLanguageAttribute() }
  },
  addProseMirrorPlugins() {
    const codeBlockType = this.type
    const editor = this.editor

    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              if (
                !editor.isEditable ||
                event.target !== view.dom ||
                view.state.doc.lastChild?.type !== codeBlockType
              ) {
                return false
              }

              const lastElement = view.dom.lastElementChild

              if (!lastElement || event.clientY <= lastElement.getBoundingClientRect().bottom) {
                return false
              }

              const handled = editor.chain().focus('end').exitCode().run()

              if (handled) {
                event.preventDefault()
              }

              return handled
            },
          },
        },
      }),
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      [
        'code',
        {
          class: node.attrs.language
            ? this.options.languageClassPrefix + node.attrs.language
            : null,
          style: richTextCodeBlockCodeStyle,
        },
        0,
      ],
    ]
  },
}).configure({
  lowlight: codeBlockLowlight,
  HTMLAttributes: {
    class: 'hljs',
  },
})

export const codeBlockAction = defineRichTextAction(codeBlockFeature, {
  key: codeBlockFeature.key,
  command:
    () =>
    ({ chain }) =>
      chain().focus().toggleCodeBlock().run(),
  isActive: (editor) => editor.isActive('codeBlock'),
})

export const codeBlockActionItem = defineRichTextActionItem(codeBlockAction, {
  label: '代码块',
  icon: 'i-[lucide--square-code]',
  keywords: ['代码', 'codeblock'],
})

export const setCodeBlockLanguageAction = defineRichTextAction(codeBlockFeature, {
  key: 'set-code-block-language',
  command:
    (language: string | null) =>
    ({ chain }) =>
      chain().focus().updateAttributes('codeBlock', { language }).run(),
})

export const codeBlockEditorFeature = defineRichTextEditorFeature(codeBlockFeature, {
  extensions: () => [RichTextCodeBlock],
})
