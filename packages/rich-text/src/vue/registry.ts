import type { RichTextPreset } from '../core/preset'
import type { RichTextToolbarItem } from '../core/toolbar'
import { blockquoteFeature } from '../features/blockquote/shared'
import { blockquoteToolbarItem } from '../features/blockquote/vue'
import { boldFeature } from '../features/bold/shared'
import { boldToolbarItem } from '../features/bold/vue'
import { headingFeature } from '../features/heading/shared'
import { headingToolbarItems } from '../features/heading/vue'
import { historyFeature } from '../features/history/shared'
import { historyToolbarItems } from '../features/history/vue'
import { horizontalRuleFeature } from '../features/horizontal-rule/shared'
import { horizontalRuleToolbarItem } from '../features/horizontal-rule/vue'
import { italicFeature } from '../features/italic/shared'
import { italicToolbarItem } from '../features/italic/vue'
import { listFeature } from '../features/list/shared'
import { listToolbarItems } from '../features/list/vue'
import { underlineFeature } from '../features/underline/shared'
import { underlineToolbarItem } from '../features/underline/vue'

const richTextToolbarRegistry = new Map<string, RichTextToolbarItem[]>([
  [boldFeature.key, [boldToolbarItem]],
  [italicFeature.key, [italicToolbarItem]],
  [underlineFeature.key, [underlineToolbarItem]],
  [headingFeature.key, headingToolbarItems],
  [blockquoteFeature.key, [blockquoteToolbarItem]],
  [listFeature.key, listToolbarItems],
  [horizontalRuleFeature.key, [horizontalRuleToolbarItem]],
  [historyFeature.key, historyToolbarItems],
])

export function getRichTextToolbarItems(preset: RichTextPreset): Map<string, RichTextToolbarItem> {
  const enabledFeatureKeys = new Set(preset.features.map((feature) => feature.key))
  const items = new Map<string, RichTextToolbarItem>()

  for (const [featureKey, featureItems] of richTextToolbarRegistry) {
    if (!enabledFeatureKeys.has(featureKey)) {
      continue
    }

    for (const item of featureItems) {
      items.set(item.key, item)
    }
  }

  return items
}
