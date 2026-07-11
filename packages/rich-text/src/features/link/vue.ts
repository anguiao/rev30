import { richTextToolbarComponent } from '../../vue/toolbar'
import { linkFeature } from './shared'
import LinkToolbarControl from './vue/LinkToolbarControl.vue'

export const linkToolbarControl = richTextToolbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkToolbarControl,
  props: {},
})
