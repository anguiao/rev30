import { richTextQuickBarComponent } from '../../../vue/quick-bar'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import { highlightColorOptions } from '../colors'
import { highlightFeature } from '../shared'
import HighlightToolbarControl from './HighlightToolbarControl.vue'
import HighlightQuickBarControl from './HighlightQuickBarControl.vue'

export const highlightToolbarControl = richTextToolbarComponent({
  feature: highlightFeature,
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
  },
})

export const highlightQuickBarControl = richTextQuickBarComponent({
  feature: highlightFeature,
  component: HighlightQuickBarControl,
  props: {
    colors: highlightColorOptions,
  },
})
