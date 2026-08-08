import type { Editor } from '@tiptap/core'
import { highlightFeature } from '../../src/features/highlight/core/feature'
import HighlightControl from '../../src/features/highlight/vue/HighlightControl.vue'
import { linkFeature } from '../../src/features/link/core/feature'
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
  props: {},
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
    // @ts-expect-error Editor is injected by the toolbar renderer.
    editor,
  },
})
