import { richTextStatusBarComponent } from '../../../vue/status-bar'
import { elementPathFeature } from '../shared'
import ElementPathStatusBarItem from './ElementPathStatusBarItem.vue'

export const elementPathStatusBarItem = richTextStatusBarComponent({
  feature: elementPathFeature,
  component: ElementPathStatusBarItem,
  props: {},
})
