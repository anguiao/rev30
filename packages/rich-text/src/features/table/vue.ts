import { richTextToolbarComponent } from '../../vue/toolbar'
import { tableFeature } from './shared'
import TableToolbarControl from './vue/TableToolbarControl.vue'

export const tableToolbarControl = richTextToolbarComponent({
  feature: tableFeature,
  key: tableFeature.key,
  component: TableToolbarControl,
  props: {},
})
