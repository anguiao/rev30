import { richTextToolbarComponent } from '../../../../client/vue/toolbar'
import { searchReplaceFeature } from '../../core/feature'
import SearchReplaceToolbarControl from './SearchReplaceToolbarControl.vue'

export const searchReplaceToolbarControl = richTextToolbarComponent({
  feature: searchReplaceFeature,
  component: SearchReplaceToolbarControl,
  props: {},
})
