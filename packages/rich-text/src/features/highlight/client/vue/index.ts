import { richTextQuickBarComponent } from '../../../../client/vue/quick-bar'
import { richTextToolbarComponent } from '../../../../client/vue/toolbar'
import { highlightFeature } from '../../core/feature'
import HighlightControl from './HighlightControl.vue'

export const highlightToolbarControl = richTextToolbarComponent({
  feature: highlightFeature,
  component: HighlightControl,
  props: {},
})

export const highlightQuickBarControl = richTextQuickBarComponent({
  feature: highlightFeature,
  component: HighlightControl,
  props: {},
})
