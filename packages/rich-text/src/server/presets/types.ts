import { validateRichTextFeatureImplementations, type RichTextFeature } from '../../core/feature'
import type { RichTextPreset } from '../../core/preset'
import type { RichTextServerFeature } from '../feature'
import type { RichTextHtmlPolicy } from '../policy'

export interface RichTextServerPreset<
  Key extends string = string,
  Features extends readonly RichTextFeature[] = readonly RichTextFeature[],
  ServerFeatures extends readonly RichTextServerFeature[] = readonly RichTextServerFeature[],
> extends RichTextPreset<Key, Features> {
  readonly serverFeatures: ServerFeatures
  readonly htmlPolicies: readonly RichTextHtmlPolicy[]
}

export function defineRichTextServerPreset<
  const Preset extends RichTextPreset,
  const ServerFeatures extends readonly RichTextServerFeature<Preset['features'][number]>[],
>(
  preset: Preset,
  serverFeatures: ServerFeatures,
): RichTextServerPreset<Preset['key'], Preset['features'], ReadonlyArray<ServerFeatures[number]>> {
  const frozenServerFeatures = Object.freeze([...serverFeatures])

  validateRichTextFeatureImplementations(preset, 'server', frozenServerFeatures)
  const htmlPolicies = Object.freeze(
    frozenServerFeatures.map((serverFeature) => serverFeature.htmlPolicy),
  )

  return Object.freeze({
    key: preset.key,
    features: preset.features,
    serverFeatures: frozenServerFeatures,
    htmlPolicies,
  })
}
