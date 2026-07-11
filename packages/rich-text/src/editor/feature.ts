import type { AnyExtension } from '@tiptap/core'
import {
  validateRichTextFeatureImplementations,
  type RichTextFeature,
  type RichTextFeatureImplementation,
} from '../core/feature'
import type { RichTextPreset } from '../core/preset'
import type { RichTextAction } from './action'

export interface RichTextEditorFeature<
  Feature extends RichTextFeature = RichTextFeature,
> extends RichTextFeatureImplementation {
  readonly feature: Feature
  readonly actions: readonly Pick<RichTextAction<Feature>, 'feature' | 'key'>[]
  readonly extensions?: () => readonly AnyExtension[]
}

export function defineRichTextEditorFeature<const Feature extends RichTextFeature>(
  feature: Feature,
  implementation: Omit<RichTextEditorFeature<Feature>, 'feature' | 'actions'> & {
    readonly actions?: RichTextEditorFeature<Feature>['actions']
  },
): RichTextEditorFeature<Feature> {
  if (!feature.editorImplementation) {
    throw new Error(`Rich text feature "${feature.key}" does not declare the editor implementation`)
  }

  const actions = Object.freeze([...(implementation.actions ?? [])])
  const actionKeys = new Set<string>()

  for (const action of actions) {
    if (action.feature !== feature) {
      throw new Error(
        `Rich text action "${action.key}" does not belong to feature "${feature.key}"`,
      )
    }

    if (actionKeys.has(action.key)) {
      throw new Error(`Rich text feature "${feature.key}" has a duplicate action: "${action.key}"`)
    }

    actionKeys.add(action.key)
  }

  return Object.freeze({
    feature,
    ...implementation,
    actions,
  })
}

interface RichTextEditorExtensionPreset extends RichTextPreset {
  readonly editorFeatures: readonly RichTextEditorFeature[]
}

export function collectRichTextEditorExtensions(
  preset: RichTextEditorExtensionPreset,
): AnyExtension[] {
  validateRichTextFeatureImplementations(preset, 'editor', preset.editorFeatures)

  const editorFeatureByFeature = new Map<RichTextFeature, RichTextEditorFeature>(
    preset.editorFeatures.map((editorFeature) => [editorFeature.feature, editorFeature]),
  )

  return preset.features.flatMap((feature) => {
    const editorFeature = editorFeatureByFeature.get(feature)

    return [...(feature.documentExtensions?.() ?? []), ...(editorFeature?.extensions?.() ?? [])]
  })
}
