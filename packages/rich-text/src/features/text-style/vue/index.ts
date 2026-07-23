import { richTextToolbarComponent } from '../../../vue/toolbar'
import {
  textStyleColorOptions,
  textStyleFontFamilyOptions,
  textStyleFontSizeOptions,
  textStyleLineHeightOptions,
} from '../options'
import { textStyleFeature } from '../shared'
import TextStyleToolbarControl from './TextStyleToolbarControl.vue'

export const textStyleToolbarControl = richTextToolbarComponent({
  feature: textStyleFeature,
  key: textStyleFeature.key,
  component: TextStyleToolbarControl,
  props: {
    colors: textStyleColorOptions,
    fontFamilies: textStyleFontFamilyOptions,
    fontSizes: textStyleFontSizeOptions,
    lineHeights: textStyleLineHeightOptions,
  },
})
