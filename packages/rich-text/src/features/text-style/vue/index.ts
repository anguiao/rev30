import { richTextToolbarComponent } from '../../../vue/toolbar'
import {
  textStyleColorOptions,
  textStyleFontFamilyOptions,
  textStyleFontSizeOptions,
  textStyleLineHeightOptions,
} from '../core/options'
import { textStyleFeature } from '../core/feature'
import TextStyleToolbarControl from './TextStyleToolbarControl.vue'

export const textStyleToolbarControl = richTextToolbarComponent({
  feature: textStyleFeature,
  component: TextStyleToolbarControl,
  props: {
    colors: textStyleColorOptions,
    fontFamilies: textStyleFontFamilyOptions,
    fontSizes: textStyleFontSizeOptions,
    lineHeights: textStyleLineHeightOptions,
  },
})
