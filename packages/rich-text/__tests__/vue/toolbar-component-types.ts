import type { Editor } from '@tiptap/core'
import { highlightColorOptions } from '../../src/features/highlight/colors'
import { highlightFeature } from '../../src/features/highlight/shared'
import HighlightToolbarControl from '../../src/features/highlight/vue/HighlightToolbarControl.vue'
import { linkFeature } from '../../src/features/link/shared'
import LinkControl from '../../src/features/link/vue/LinkControl.vue'
import { richTextToolbarComponent } from '../../src/vue/toolbar'

declare const editor: Editor

richTextToolbarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
  },
})

richTextToolbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkControl,
  props: { surface: 'toolbar' },
})

richTextToolbarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightToolbarControl,
  // @ts-expect-error Required component props should be provided.
  props: {},
})

richTextToolbarComponent({
  feature: highlightFeature,
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
    // @ts-expect-error Unknown component props should be rejected.
    colour: highlightColorOptions,
  },
})

richTextToolbarComponent({
  feature: linkFeature,
  key: 'link',
  component: LinkControl,
  props: {
    surface: 'toolbar',
    // @ts-expect-error Editor is injected by the toolbar renderer.
    editor,
  },
})
