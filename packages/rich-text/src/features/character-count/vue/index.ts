import { richTextStatusBarComponent } from '../../../vue/status-bar'
import { characterCountFeature } from '../shared'
import CharacterCountStatusBarItem from './CharacterCountStatusBarItem.vue'

export const characterCountStatusBarItem = richTextStatusBarComponent({
  feature: characterCountFeature,
  key: characterCountFeature.key,
  component: CharacterCountStatusBarItem,
  props: {},
})
