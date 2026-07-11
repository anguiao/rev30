import type { AnyExtension } from '@tiptap/core'
import type { RichTextFeature } from './feature'

export interface RichTextPreset<
  Key extends string = string,
  Features extends readonly RichTextFeature[] = readonly RichTextFeature[],
> {
  readonly key: Key
  readonly features: Features
}

function validateRichTextPreset(preset: RichTextPreset) {
  const featureKeys = new Set<string>()
  const features = new Set(preset.features)

  for (const feature of preset.features) {
    if (featureKeys.has(feature.key)) {
      throw new Error(`Rich text preset "${preset.key}" has a duplicate feature: "${feature.key}"`)
    }

    featureKeys.add(feature.key)

    for (const dependency of feature.dependencies) {
      if (!features.has(dependency)) {
        throw new Error(
          `Rich text preset "${preset.key}" is missing dependency "${dependency.key}" for feature "${feature.key}"`,
        )
      }
    }
  }

  const visiting = new Set<RichTextFeature>()
  const visited = new Set<RichTextFeature>()

  function visit(feature: RichTextFeature) {
    if (visiting.has(feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" has a dependency cycle at feature "${feature.key}"`,
      )
    }

    if (visited.has(feature)) {
      return
    }

    visiting.add(feature)
    for (const dependency of feature.dependencies) {
      visit(dependency)
    }
    visiting.delete(feature)
    visited.add(feature)
  }

  for (const feature of preset.features) {
    visit(feature)
  }
}

export function defineRichTextPreset<
  const Key extends string,
  const Features extends readonly RichTextFeature[],
>(preset: RichTextPreset<Key, Features>): RichTextPreset<Key, ReadonlyArray<Features[number]>> {
  validateRichTextPreset(preset)
  const features = Object.freeze([...preset.features])

  return Object.freeze({
    ...preset,
    features,
  })
}

export function collectRichTextDocumentExtensions(preset: RichTextPreset): AnyExtension[] {
  return preset.features.flatMap((feature) => feature.documentExtensions?.() ?? [])
}
