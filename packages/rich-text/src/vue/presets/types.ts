import { validateRichTextFeatureImplementations } from '../../core/feature'
import type { RichTextPreset } from '../../core/preset'
import type { RichTextEditorFeature } from '../../editor/feature'
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

export function defineRichTextEditorPreset<
  const Preset extends RichTextPreset,
  const EditorFeatures extends readonly RichTextEditorFeature<Preset['features'][number]>[],
>(
  preset: Preset,
  options: {
    readonly editorFeatures: EditorFeatures
    readonly toolbar?: RichTextToolbarConfig
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

  return Object.freeze(
    options.toolbar
      ? {
          key: preset.key,
          features: preset.features,
          editorFeatures,
          toolbar: options.toolbar,
        }
      : {
          key: preset.key,
          features: preset.features,
          editorFeatures,
        },
  )
}
