import { richTextToolbarComponent } from '../../../vue/toolbar'
import { richTextQuickBarComponent } from '../../../vue/quick-bar'
import { highlightColorOptions } from '../colors'
import { highlightFeature } from '../shared'
import HighlightToolbarControl from './HighlightToolbarControl.vue'
import HighlightQuickBarControl from './HighlightQuickBarControl.vue'

export const highlightToolbarControl = richTextToolbarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
  },
})

export const highlightQuickBarControl = richTextQuickBarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightQuickBarControl,
  props: {
    colors: highlightColorOptions,
  },
})
