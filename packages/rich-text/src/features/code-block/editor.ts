import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { createCodeBlockLanguageAttribute, type CodeBlockLanguage } from './languages'
import { codeBlockLowlight } from './lowlight'
import { codeBlockFeature } from './shared'

const RichTextCodeBlockLowlight = CodeBlockLowlight.extend({
  addAttributes() {
    return { language: createCodeBlockLanguageAttribute() }
  },
}).configure({
  lowlight: codeBlockLowlight,
  HTMLAttributes: {
    class: 'hljs',
  },
})

export const codeBlockAction = defineRichTextAction(codeBlockFeature, {
  key: codeBlockFeature.key,
  run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  isActive: (editor) => editor.isActive('codeBlock'),
  canRun: (editor) => editor.can().chain().focus().toggleCodeBlock().run(),
})

export const setCodeBlockLanguageAction = defineRichTextAction(codeBlockFeature, {
  key: 'set-code-block-language',
  run(editor, language: CodeBlockLanguage | null) {
    const chain = editor.chain().focus()

    if (editor.isActive('codeBlock')) {
      return chain.updateAttributes('codeBlock', { language }).run()
    }

    return language === null ? chain.setCodeBlock().run() : chain.setCodeBlock({ language }).run()
  },
})

export const codeBlockEditorFeature = defineRichTextEditorFeature(codeBlockFeature, {
  extensions: () => [RichTextCodeBlockLowlight],
})
