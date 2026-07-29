import type { AnyExtension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { RichTextFeature } from '../core/feature'
import type { RichTextPreset } from '../core/preset'
import type { RichTextHtmlPolicy } from './sanitize'

export interface RichTextServerFeature<Feature extends RichTextFeature = RichTextFeature> {
  readonly feature: Feature
  readonly htmlPolicy: RichTextHtmlPolicy
  readonly extensions?: () => readonly AnyExtension[]
  readonly assertDocument?: (document: ProseMirrorNode) => void
}

export function defineRichTextServerFeature<const Feature extends RichTextFeature>(
  feature: Feature,
  implementation: Omit<RichTextServerFeature<Feature>, 'feature'>,
): RichTextServerFeature<Feature> {
  if (!feature.serverImplementation) {
    throw new Error(`Rich text feature "${feature.key}" does not declare the server implementation`)
  }

  return { feature, ...implementation }
}

interface RichTextServerExtensionPreset extends RichTextPreset {
  readonly serverFeatures: readonly RichTextServerFeature[]
}

export function collectRichTextServerExtensions(
  preset: RichTextServerExtensionPreset,
): AnyExtension[] {
  const serverImplementationByFeature = new Map<RichTextFeature, RichTextServerFeature>(
    preset.serverFeatures.map((implementation) => [implementation.feature, implementation]),
  )

  return preset.features.flatMap((feature) => [
    ...(feature.sharedExtensions?.() ?? []),
    ...(serverImplementationByFeature.get(feature)?.extensions?.() ?? []),
  ])
}
