import { richTextStatusBarComponent } from '../../../vue/status-bar'
import { characterCountFeature } from '../shared'
import CharacterCountStatusBarItem from './CharacterCountStatusBarItem.vue'

export const characterCountStatusBarItem = richTextStatusBarComponent({
  feature: characterCountFeature,
  component: CharacterCountStatusBarItem,
  props: {},
})
