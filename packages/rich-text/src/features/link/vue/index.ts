import { richTextToolbarComponent } from '../../../vue/toolbar'
import { richTextFeatureQuickBar, richTextQuickBarComponent } from '../../../vue/quick-bar'
import { linkFeature } from '../shared'
import { resolveRichTextLinkTarget } from '../target'
import LinkControl from './LinkControl.vue'
import LinkQuickBar from './LinkQuickBar.vue'

export const linkToolbarControl = richTextToolbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkControl,
  props: { surface: 'toolbar' },
})

export const linkQuickBarControl = richTextQuickBarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkControl,
  props: { surface: 'text-quick-bar' },
})

export const linkQuickBar = richTextFeatureQuickBar({
  feature: linkFeature,
  isActive: (editor) => resolveRichTextLinkTarget(editor, 'quick-bar') !== null,
  component: LinkQuickBar,
  props: {},
})
