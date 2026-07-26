import type { Editor } from '@tiptap/core'
import { highlightFeature } from '../../src/features/highlight/shared'
import HighlightControl from '../../src/features/highlight/vue/HighlightControl.vue'
import { linkFeature } from '../../src/features/link/shared'
import LinkControl from '../../src/features/link/vue/LinkControl.vue'
import { richTextToolbarComponent } from '../../src/vue/toolbar'

declare const editor: Editor

richTextToolbarComponent({
  feature: highlightFeature,
  component: HighlightControl,
  props: {},
})

richTextToolbarComponent({
  feature: linkFeature,
  component: LinkControl,
  props: { surface: 'toolbar' },
})

richTextToolbarComponent({
  feature: highlightFeature,
  component: HighlightControl,
  props: {
    // @ts-expect-error Unknown component props should be rejected.
    colour: true,
  },
})

richTextToolbarComponent({
  feature: linkFeature,
  component: LinkControl,
  props: {
    surface: 'toolbar',
    // @ts-expect-error Editor is injected by the toolbar renderer.
    editor,
  },
})
