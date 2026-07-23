import type { AnyExtension } from '@tiptap/core'
import type { RichTextFeature } from '../core/feature'
import type { RichTextPreset } from '../core/preset'

export interface RichTextEditorFeature<Feature extends RichTextFeature = RichTextFeature> {
  readonly feature: Feature
  readonly extensions?: () => readonly AnyExtension[]
}

export function defineRichTextEditorFeature<const Feature extends RichTextFeature>(
  feature: Feature,
  implementation: Omit<RichTextEditorFeature<Feature>, 'feature'>,
): RichTextEditorFeature<Feature> {
  if (!feature.editorImplementation) {
    throw new Error(`Rich text feature "${feature.key}" does not declare the editor implementation`)
  }

  return Object.freeze({
    feature,
    ...implementation,
  })
}

interface RichTextEditorExtensionPreset extends RichTextPreset {
  readonly editorFeatures: readonly RichTextEditorFeature[]
}

export function collectRichTextEditorExtensions(
  preset: RichTextEditorExtensionPreset,
): AnyExtension[] {
  const editorFeatureByFeature = new Map<RichTextFeature, RichTextEditorFeature>(
    preset.editorFeatures.map((editorFeature) => [editorFeature.feature, editorFeature]),
  )

  return preset.features.flatMap((feature) => {
    const editorFeature = editorFeatureByFeature.get(feature)

    return [...(feature.documentExtensions?.() ?? []), ...(editorFeature?.extensions?.() ?? [])]
  })
}
