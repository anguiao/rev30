import { richTextStatusBarComponent } from '../../../vue/status-bar'
import { characterCountFeature } from '../core/feature'
import CharacterCountStatusBarItem from './CharacterCountStatusBarItem.vue'

export const characterCountStatusBarItem = richTextStatusBarComponent({
  feature: characterCountFeature,
  component: CharacterCountStatusBarItem,
  props: {},
})
