import type { AnyExtension } from '@tiptap/core'

export type RichTextRuntime = 'editor' | 'server'

export interface RichTextFeature<Key extends string = string> {
  readonly key: Key
  readonly editorImplementation: boolean
  readonly serverImplementation: boolean
  readonly dependencies: readonly RichTextFeature[]
  readonly documentExtensions?: () => readonly AnyExtension[]
}

export interface RichTextFeatureImplementation {
  readonly feature: RichTextFeature
}

export function defineRichTextFeature<const Key extends string>(
  feature: Omit<RichTextFeature<Key>, 'dependencies'> & {
    readonly dependencies?: readonly RichTextFeature[]
  },
): RichTextFeature<Key> {
  const dependencies = Object.freeze([...(feature.dependencies ?? [])])

  return Object.freeze({
    ...feature,
    dependencies,
  })
}

export function validateRichTextFeatureImplementations(
  preset: { readonly key: string; readonly features: readonly RichTextFeature[] },
  runtime: RichTextRuntime,
  implementations: readonly RichTextFeatureImplementation[],
) {
  const presetFeatures = new Set(preset.features)
  const implementedFeatures = new Set<RichTextFeature>()
  const implementationField = runtime === 'editor' ? 'editorImplementation' : 'serverImplementation'

  for (const implementation of implementations) {
    const { feature } = implementation

    if (!presetFeatures.has(feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" has an unknown ${runtime} feature implementation: "${feature.key}"`,
      )
    }

    if (!feature[implementationField]) {
      throw new Error(
        `Rich text feature "${feature.key}" does not declare the ${runtime} implementation in preset "${preset.key}"`,
      )
    }

    if (implementedFeatures.has(feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" has duplicate ${runtime} feature implementations: "${feature.key}"`,
      )
    }

    implementedFeatures.add(feature)
  }

  for (const feature of preset.features) {
    if (feature[implementationField] && !implementedFeatures.has(feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" is missing the ${runtime} feature implementation: "${feature.key}"`,
      )
    }
  }
}
