import { mergeAttributes } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Plugin } from '@tiptap/pm/state'
import { common, createLowlight } from 'lowlight'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { createCodeBlockLanguageAttribute } from './languages'
import { codeBlockFeature, richTextCodeBlockCodeStyle } from './shared'

const codeBlockLowlight = createLowlight(common)
codeBlockLowlight.highlightAuto = (value) => codeBlockLowlight.highlight('plaintext', value)

const RichTextCodeBlockLowlight = CodeBlockLowlight.extend({
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
              const lastElement = view.dom.lastElementChild

              if (
                !editor.isEditable ||
                event.button !== 0 ||
                event.target !== view.dom ||
                view.state.doc.lastChild?.type !== codeBlockType ||
                !lastElement ||
                event.clientY <= lastElement.getBoundingClientRect().bottom
              ) {
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
  defaultLanguage: 'plaintext',
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

export const setCodeBlockLanguageAction = defineRichTextAction(codeBlockFeature, {
  key: 'set-code-block-language',
  command:
    (language: string | null) =>
    ({ chain }) =>
      chain().focus().updateAttributes('codeBlock', { language }).run(),
})

export const codeBlockEditorFeature = defineRichTextEditorFeature(codeBlockFeature, {
  extensions: () => [RichTextCodeBlockLowlight],
})
