import { highlightColorOptions } from '../../src/features/highlight/colors'
import { highlightFeature } from '../../src/features/highlight/shared'
import HighlightToolbarControl from '../../src/features/highlight/vue/HighlightToolbarControl.vue'
import { linkFeature } from '../../src/features/link/shared'
import LinkToolbarControl from '../../src/features/link/vue/LinkToolbarControl.vue'
import { richTextToolbarComponent } from '../../src/vue/toolbar'

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
  component: LinkToolbarControl,
  props: {},
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
  component: LinkToolbarControl,
  props: {
    // @ts-expect-error Editor is injected by the toolbar renderer.
    editor: null,
  },
})
