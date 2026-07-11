import { richTextToolbarComponent } from '../../vue/toolbar'
import { highlightColorOptions } from './colors'
import { highlightFeature } from './shared'
import HighlightToolbarControl from './vue/HighlightToolbarControl.vue'

export const highlightToolbarControl = richTextToolbarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
  },
})
