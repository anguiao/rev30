import { richTextToolbarComponent } from '../../vue/toolbar'
import { richTextFeatureQuickbar, richTextQuickbarComponent } from '../../vue/quickbar'
import { linkFeature } from './shared'
import { resolveRichTextLinkTarget } from './target'
import LinkControl from './vue/LinkControl.vue'
import LinkQuickbar from './vue/LinkQuickbar.vue'

export const linkToolbarControl = richTextToolbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkControl,
  props: { surface: 'toolbar' },
})

export const linkQuickbarControl = richTextQuickbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkControl,
  props: { surface: 'text-quickbar' },
})

export const linkQuickbar = richTextFeatureQuickbar({
  feature: linkFeature,
  key: 'link',
  isActive: (editor) => resolveRichTextLinkTarget(editor, 'quickbar') !== null,
  component: LinkQuickbar,
  props: {},
})
