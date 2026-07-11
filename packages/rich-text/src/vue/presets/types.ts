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
  editorFeatureByFeature: ReadonlyMap<RichTextEditorFeature['feature'], RichTextEditorFeature>,
  control: RichTextToolbarControlConfig,
) {
  const feature = getRichTextToolbarControlFeature(control)
  const editorFeature = editorFeatureByFeature.get(feature)

  if (!editorFeature || !preset.features.includes(feature)) {
    throw new Error(
      `Rich text preset "${preset.key}" has a toolbar control for unknown feature "${feature.key}"`,
    )
  }

  const actions =
    control.type === 'button'
      ? [control.item.action]
      : control.type === 'dropdown'
        ? control.items.map((item) => item.action)
        : []

  for (const action of actions) {
    if (!editorFeature.actions.includes(action)) {
      throw new Error(
        `Rich text toolbar action "${action.key}" is not registered by feature "${feature.key}"`,
      )
    }
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
    const editorFeatureByFeature = new Map(
      editorFeatures.map((editorFeature) => [editorFeature.feature, editorFeature]),
    )

    for (const group of options.toolbar.groups) {
      for (const control of group.controls) {
        validateToolbarControl(preset, editorFeatureByFeature, control)
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
