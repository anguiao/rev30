import { richTextToolbarComponent } from '../../vue/toolbar'
import { characterCountFeature } from './shared'
import CharacterCountToolbarControl from './vue/CharacterCountToolbarControl.vue'

export const characterCountToolbarControl = richTextToolbarComponent({
  feature: characterCountFeature,
  key: characterCountFeature.key,
  component: CharacterCountToolbarControl,
  props: {},
})
