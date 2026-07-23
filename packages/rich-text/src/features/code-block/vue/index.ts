import type { Editor } from '@tiptap/core'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { codeBlockFeature } from '../shared'
import { resolveRichTextCodeBlockTarget } from '../target'
import CodeBlockToolbarControl from './CodeBlockToolbarControl.vue'
import CodeBlockQuickBar from './CodeBlockQuickBar.vue'

export const codeBlockLanguageOptions = [
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
] as const

export const codeBlockToolbarControl = richTextToolbarComponent({
  feature: codeBlockFeature,
  key: codeBlockFeature.key,
  component: CodeBlockToolbarControl,
  props: {
    languages: codeBlockLanguageOptions,
  },
})

export const codeBlockQuickBar = richTextFeatureQuickBar({
  feature: codeBlockFeature,
  isActive: (editor) => resolveRichTextCodeBlockTarget(editor) !== null,
  getAnchorElement: (editor: Editor) => {
    const target = resolveRichTextCodeBlockTarget(editor)
    const element = target ? editor.view.nodeDOM(target.position) : null
    return element instanceof HTMLElement ? element : null
  },
  anchorAlignment: 'end',
  component: CodeBlockQuickBar,
  props: {
    languages: codeBlockLanguageOptions,
  },
})
