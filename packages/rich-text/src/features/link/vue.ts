import { richTextToolbarComponent } from '../../vue/toolbar'
import { richTextFeatureQuickbar, richTextQuickbarComponent } from '../../vue/quickbar'
import { linkFeature } from './shared'
import { resolveRichTextLinkTarget } from './target'
import LinkQuickbar from './vue/LinkQuickbar.vue'
import LinkQuickbarControl from './vue/LinkQuickbarControl.vue'
import LinkToolbarControl from './vue/LinkToolbarControl.vue'

export const linkToolbarControl = richTextToolbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkToolbarControl,
  props: {},
})

export const linkQuickbarControl = richTextQuickbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkQuickbarControl,
  props: {},
})

export const linkQuickbar = richTextFeatureQuickbar({
  feature: linkFeature,
  key: 'link',
  isActive: (editor) => resolveRichTextLinkTarget(editor, 'quickbar') !== null,
  component: LinkQuickbar,
  props: {},
})
