import { highlightColorOptions } from '../../src/features/highlight/colors'
import HighlightToolbarControl from '../../src/features/highlight/vue/HighlightToolbarControl.vue'
import LinkToolbarControl from '../../src/features/link/vue/LinkToolbarControl.vue'
import { richTextToolbarComponent } from '../../src/vue/toolbar'

richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
  },
})

richTextToolbarComponent({
  key: 'link',
  component: LinkToolbarControl,
  props: {},
})

richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  // @ts-expect-error Required component props should be provided.
  props: {},
})

richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColorOptions,
    // @ts-expect-error Unknown component props should be rejected.
    colour: highlightColorOptions,
  },
})

richTextToolbarComponent({
  key: 'link',
  component: LinkToolbarControl,
  props: {
    // @ts-expect-error Editor is injected by the toolbar renderer.
    editor: null,
  },
})
