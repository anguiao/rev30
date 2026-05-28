import { richTextToolbarComponent } from '../../vue/toolbar'
import LinkToolbarControl from './vue/LinkToolbarControl.vue'

export const linkToolbarControl = richTextToolbarComponent({
  key: 'link',
  component: LinkToolbarControl,
  props: {},
})
