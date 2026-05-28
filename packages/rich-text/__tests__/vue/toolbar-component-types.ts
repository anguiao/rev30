import { highlightColors } from '../../src/features/highlight/vue'
import HighlightToolbarControl from '../../src/features/highlight/vue/HighlightToolbarControl.vue'
import LinkToolbarControl from '../../src/features/link/vue/LinkToolbarControl.vue'
import { richTextToolbarComponent } from '../../src/vue/toolbar/types'

richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColors,
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
    colors: highlightColors,
    // @ts-expect-error Unknown component props should be rejected.
    colour: highlightColors,
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
