import type { AnyExtension } from '@tiptap/core'

export interface RichTextFeature<Key extends string = string> {
  readonly key: Key
  readonly editorImplementation: boolean
  readonly serverImplementation: boolean
  readonly documentExtensions?: () => readonly AnyExtension[]
}

export function defineRichTextFeature<const Key extends string>(
  feature: RichTextFeature<Key>,
): RichTextFeature<Key> {
  return feature
}

export function validateRichTextFeatureImplementations(
  preset: { readonly key: string; readonly features: readonly RichTextFeature[] },
  implementation: 'editor' | 'server',
  implementations: readonly { readonly feature: RichTextFeature }[],
) {
  const presetFeatures = new Set(preset.features)
  const implementedFeatures = new Set<RichTextFeature>()
  const implementationField =
    implementation === 'editor' ? 'editorImplementation' : 'serverImplementation'

  for (const { feature } of implementations) {
    if (!presetFeatures.has(feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" has an unknown ${implementation} feature implementation: "${feature.key}"`,
      )
    }

    if (implementedFeatures.has(feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" has duplicate ${implementation} feature implementations: "${feature.key}"`,
      )
    }

    implementedFeatures.add(feature)
  }

  for (const feature of preset.features) {
    if (feature[implementationField] && !implementedFeatures.has(feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" is missing the ${implementation} feature implementation: "${feature.key}"`,
      )
    }
  }
}
