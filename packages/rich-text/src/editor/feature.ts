import type { AnyExtension } from '@tiptap/core'
import type { RichTextFeature } from '../core/feature'
import type { RichTextPreset } from '../core/preset'
import type { RichTextInteraction } from './interaction'
import { createRichTextPasteExtension, type RichTextPasteRule } from './paste'

export interface RichTextEditorFeature<Feature extends RichTextFeature = RichTextFeature> {
  readonly feature: Feature
  readonly extensions?: () => readonly AnyExtension[]
  readonly interactions?: readonly RichTextInteraction<Feature>[]
  readonly pasteRule?: RichTextPasteRule
}

export function defineRichTextEditorFeature<const Feature extends RichTextFeature>(
  feature: Feature,
  implementation: Omit<RichTextEditorFeature<Feature>, 'feature'>,
): RichTextEditorFeature<Feature> {
  if (!feature.editorImplementation) {
    throw new Error(`Rich text feature "${feature.key}" does not declare the editor implementation`)
  }

  const interactionKeys = new Set<string>()

  for (const interaction of implementation.interactions ?? []) {
    if (interaction.feature !== feature) {
      throw new Error(
        `Rich text editor feature "${feature.key}" has an interaction for another feature: "${interaction.feature.key}"`,
      )
    }

    if (interactionKeys.has(interaction.key)) {
      throw new Error(
        `Rich text editor feature "${feature.key}" has a duplicate interaction: "${interaction.key}"`,
      )
    }

    interactionKeys.add(interaction.key)
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

  const extensions: AnyExtension[] = preset.features.flatMap((feature) => {
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

  if (pasteRules.length > 0) {
    extensions.push(createRichTextPasteExtension(pasteRules))
  }

  return extensions
}
