import { validateRichTextFeatureImplementations } from '../../core/feature'
import type { RichTextPreset } from '../../core/preset'
import type { RichTextEditorFeature } from '../../editor/feature'
import type { RichTextStatusBarConfig, RichTextStatusBarComponentItem } from '../status-bar'
import {
  getRichTextToolbarControlFeature,
  type RichTextToolbarConfig,
  type RichTextToolbarControlConfig,
} from '../toolbar'

export interface RichTextEditorPreset<
  Preset extends RichTextPreset = RichTextPreset,
  EditorFeatures extends readonly RichTextEditorFeature[] = readonly RichTextEditorFeature[],
> extends RichTextPreset<Preset['key'], Preset['features']> {
  readonly editorFeatures: EditorFeatures
  readonly toolbar?: RichTextToolbarConfig
  readonly statusBar?: RichTextStatusBarConfig
}

function validateToolbarControl(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  control: RichTextToolbarControlConfig,
) {
  const feature = getRichTextToolbarControlFeature(control)

  if (
    !preset.features.includes(feature) ||
    !editorFeatures.some((editorFeature) => editorFeature.feature === feature)
  ) {
    throw new Error(
      `Rich text preset "${preset.key}" has a toolbar control for unknown feature "${feature.key}"`,
    )
  }
}

function validateStatusBarItem(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  item: RichTextStatusBarComponentItem,
) {
  if (
    !preset.features.includes(item.feature) ||
    !editorFeatures.some((editorFeature) => editorFeature.feature === item.feature)
  ) {
    throw new Error(
      `Rich text preset "${preset.key}" has a status bar item for unknown feature "${item.feature.key}"`,
    )
  }
}

export function defineRichTextEditorPreset<
  const Preset extends RichTextPreset,
  const EditorFeatures extends readonly RichTextEditorFeature<Preset['features'][number]>[],
>(
  preset: Preset,
  options: {
    readonly editorFeatures: EditorFeatures
    readonly toolbar?: RichTextToolbarConfig
    readonly statusBar?: RichTextStatusBarConfig
  },
): RichTextEditorPreset<Preset, ReadonlyArray<EditorFeatures[number]>> {
  const editorFeatures = Object.freeze([...options.editorFeatures])

  validateRichTextFeatureImplementations(preset, 'editor', editorFeatures)

  if (options.toolbar) {
    for (const group of options.toolbar.groups) {
      for (const control of group.controls) {
        validateToolbarControl(preset, editorFeatures, control)
      }
    }
  }

  if (options.statusBar) {
    for (const item of [...options.statusBar.start, ...options.statusBar.end]) {
      validateStatusBarItem(preset, editorFeatures, item)
    }
  }

  return Object.freeze({
    key: preset.key,
    features: preset.features,
    editorFeatures,
    ...(options.toolbar ? { toolbar: options.toolbar } : {}),
    ...(options.statusBar ? { statusBar: options.statusBar } : {}),
  })
}
