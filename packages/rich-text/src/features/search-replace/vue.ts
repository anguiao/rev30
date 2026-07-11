import { richTextToolbarComponent } from '../../vue/toolbar'
import { searchReplaceFeature } from './shared'
import SearchReplaceToolbarControl from './vue/SearchReplaceToolbarControl.vue'

export const searchReplaceToolbarControl = richTextToolbarComponent({
  feature: searchReplaceFeature,
  key: searchReplaceFeature.key,
  component: SearchReplaceToolbarControl,
  props: {},
})
