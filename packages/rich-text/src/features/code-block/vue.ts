import { richTextToolbarComponent } from '../../vue/toolbar'
import { codeBlockFeature } from './shared'
import CodeBlockToolbarControl from './vue/CodeBlockToolbarControl.vue'

const codeBlockLanguageOptions = [
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
