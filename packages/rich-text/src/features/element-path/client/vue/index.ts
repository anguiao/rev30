import { richTextStatusBarComponent } from '../../../../client/vue/status-bar'
import { elementPathFeature } from '../../core/feature'
import ElementPathStatusBarItem from './ElementPathStatusBarItem.vue'

export const elementPathStatusBarItem = richTextStatusBarComponent({
  feature: elementPathFeature,
  component: ElementPathStatusBarItem,
  props: {},
})
