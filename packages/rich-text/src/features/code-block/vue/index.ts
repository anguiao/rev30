import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import { getSelectedCodeBlock } from '../editor'
import { codeBlockFeature } from '../shared'
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
  component: CodeBlockToolbarControl,
  props: {
    languages: codeBlockLanguageOptions,
  },
})

export const codeBlockQuickBar = richTextFeatureQuickBar({
  feature: codeBlockFeature,
  isActive: (editor) => getSelectedCodeBlock(editor) !== null,
  component: CodeBlockQuickBar,
  props: {
    languages: codeBlockLanguageOptions,
  },
  getAnchorElement: (editor) => {
    const codeBlock = getSelectedCodeBlock(editor)
    const element = codeBlock ? editor.view.nodeDOM(codeBlock.position) : null
    return element instanceof HTMLElement ? element : null
  },
  anchorAlignment: 'end',
})
