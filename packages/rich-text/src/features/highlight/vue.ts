import { richTextToolbarComponent } from '../../vue/toolbar/types'
import HighlightToolbarControl from './vue/HighlightToolbarControl.vue'

export const highlightColors = [
  { key: 'yellow', label: '黄色', value: '#fef08a' },
  { key: 'green', label: '绿色', value: '#bbf7d0' },
  { key: 'blue', label: '蓝色', value: '#bfdbfe' },
  { key: 'pink', label: '粉色', value: '#fbcfe8' },
] as const

export const highlightToolbarControl = richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColors,
  },
})
