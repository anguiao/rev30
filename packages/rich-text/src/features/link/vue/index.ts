import { richTextFeatureQuickBar, richTextQuickBarComponent } from '../../../vue/quick-bar'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import { resolveLinkRange } from '../range'
import { linkFeature } from '../core/feature'
import LinkControl from './LinkControl.vue'
import LinkQuickBar from './LinkQuickBar.vue'

export const linkToolbarControl = richTextToolbarComponent({
  feature: linkFeature,
  component: LinkControl,
  props: {},
})

export const linkQuickBarControl = richTextQuickBarComponent({
  feature: linkFeature,
  component: LinkControl,
  props: {},
})

export const linkQuickBar = richTextFeatureQuickBar({
  feature: linkFeature,
  isActive: (editor) => {
    const range = resolveLinkRange(editor)
    return editor.state.selection.empty && Boolean(range?.href)
  },
  component: LinkQuickBar,
  props: {},
})
