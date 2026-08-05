import type { AnyExtension } from '@tiptap/core'
import type { RichTextFeature } from '../core/feature'
import type { RichTextPreset } from '../core/preset'
import { collectRichTextPasteExtensions, type RichTextPasteRule } from './paste'

export interface RichTextEditorFeature<Feature extends RichTextFeature = RichTextFeature> {
  readonly feature: Feature
  readonly extensions?: () => readonly AnyExtension[]
  readonly pasteRule?: RichTextPasteRule
}

export function defineRichTextEditorFeature<const Feature extends RichTextFeature>(
  feature: Feature,
  implementation: Omit<RichTextEditorFeature<Feature>, 'feature'>,
): RichTextEditorFeature<Feature> {
  if (!feature.editorImplementation) {
    throw new Error(`Rich text feature "${feature.key}" does not declare the editor implementation`)
  }

  return {
    feature,
    ...implementation,
  }
}

interface RichTextEditorExtensionPreset extends RichTextPreset {
  readonly editorFeatures: readonly RichTextEditorFeature[]
}

export function collectRichTextEditorExtensions(
  preset: RichTextEditorExtensionPreset,
): AnyExtension[] {
  const editorImplementationByFeature = new Map<RichTextFeature, RichTextEditorFeature>(
    preset.editorFeatures.map((implementation) => [implementation.feature, implementation]),
  )

  const extensions = preset.features.flatMap((feature) => {
    const editorImplementation = editorImplementationByFeature.get(feature)

    return [
      ...(feature.sharedExtensions?.() ?? []),
      ...(editorImplementation?.extensions?.() ?? []),
    ]
  })

  const pasteRules = preset.features.flatMap((feature) => {
    const pasteRule = editorImplementationByFeature.get(feature)?.pasteRule

    return pasteRule ? [pasteRule] : []
  })

  return [...extensions, ...collectRichTextPasteExtensions(pasteRules)]
}
