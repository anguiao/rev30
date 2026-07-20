import { richTextToolbarComponent } from '../../vue/toolbar'
import { richTextQuickbarComponent } from '../../vue/quickbar'
import { highlightColorOptions } from './colors'
import { highlightFeature } from './shared'
import HighlightToolbarControl from './vue/HighlightToolbarControl.vue'
import HighlightQuickbarControl from './vue/HighlightQuickbarControl.vue'

export const highlightToolbarControl = richTextToolbarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
  },
})

export const highlightQuickbarControl = richTextQuickbarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightQuickbarControl,
  props: {
    colors: highlightColorOptions,
  },
})
