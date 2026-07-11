import { richTextToolbarComponent } from '../../vue/toolbar'
import { codeBlockLanguageOptions } from './languages'
import { codeBlockFeature } from './shared'
import CodeBlockToolbarControl from './vue/CodeBlockToolbarControl.vue'

export const codeBlockToolbarControl = richTextToolbarComponent({
  feature: codeBlockFeature,
  key: codeBlockFeature.key,
  component: CodeBlockToolbarControl,
  props: {
    languages: codeBlockLanguageOptions,
  },
})
