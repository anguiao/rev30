import { richTextToolbarComponent } from '../../vue/toolbar'
import { highlightColorOptions } from './colors'
import HighlightToolbarControl from './vue/HighlightToolbarControl.vue'

export const highlightToolbarControl = richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
  },
})
