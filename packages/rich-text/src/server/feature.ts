import type { AnyExtension } from '@tiptap/core'
import type { RichTextFeature } from '../core/feature'
import type { RichTextPreset } from '../core/preset'
import { freezeRichTextHtmlPolicy, type RichTextHtmlPolicy } from './policy'

export interface RichTextServerFeature<Feature extends RichTextFeature = RichTextFeature> {
  readonly feature: Feature
  readonly htmlPolicy: RichTextHtmlPolicy
  readonly extensions?: () => readonly AnyExtension[]
}

export function defineRichTextServerFeature<const Feature extends RichTextFeature>(
  feature: Feature,
  implementation: Omit<RichTextServerFeature<Feature>, 'feature' | 'htmlPolicy'> & {
    readonly htmlPolicy: RichTextHtmlPolicy
  },
): RichTextServerFeature<Feature> {
  if (!feature.serverImplementation) {
    throw new Error(`Rich text feature "${feature.key}" does not declare the server implementation`)
  }

  return Object.freeze({
    feature,
    ...implementation,
    htmlPolicy: freezeRichTextHtmlPolicy(implementation.htmlPolicy),
  })
}

interface RichTextServerExtensionPreset extends RichTextPreset {
  readonly serverFeatures: readonly RichTextServerFeature[]
}

export function collectRichTextServerExtensions(
  preset: RichTextServerExtensionPreset,
): AnyExtension[] {
  const serverFeatureByFeature = new Map<RichTextFeature, RichTextServerFeature>(
    preset.serverFeatures.map((serverFeature) => [serverFeature.feature, serverFeature]),
  )

  return preset.features.flatMap((feature) => [
    ...(feature.documentExtensions?.() ?? []),
    ...(serverFeatureByFeature.get(feature)?.extensions?.() ?? []),
  ])
}
