import { richTextToolbarComponent } from '../../../vue/toolbar'
import { richTextQuickbarComponent } from '../../../vue/quickbar'
import { highlightColorOptions } from '../colors'
import { highlightFeature } from '../shared'
import HighlightToolbarControl from './HighlightToolbarControl.vue'
import HighlightQuickbarControl from './HighlightQuickbarControl.vue'

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
