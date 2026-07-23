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

  for (const feature of preset.features) {
    if (featureKeys.has(feature.key)) {
      throw new Error(`Rich text preset "${preset.key}" has a duplicate feature: "${feature.key}"`)
    }

    featureKeys.add(feature.key)
  }
}

export function defineRichTextPreset<
  const Key extends string,
  const Features extends readonly RichTextFeature[],
>(preset: RichTextPreset<Key, Features>): RichTextPreset<Key, ReadonlyArray<Features[number]>> {
  validateRichTextPreset(preset)
  return preset
}
