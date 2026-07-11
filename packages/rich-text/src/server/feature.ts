import type { RichTextFeature, RichTextFeatureImplementation } from '../core/feature'
import { freezeRichTextHtmlPolicy, type RichTextHtmlPolicy } from './policy'

export interface RichTextServerFeature<
  Feature extends RichTextFeature = RichTextFeature,
> extends RichTextFeatureImplementation {
  readonly feature: Feature
  readonly htmlPolicy: RichTextHtmlPolicy
}

export function defineRichTextServerFeature<const Feature extends RichTextFeature>(
  feature: Feature,
  htmlPolicy: RichTextHtmlPolicy,
): RichTextServerFeature<Feature> {
  if (!feature.serverImplementation) {
    throw new Error(`Rich text feature "${feature.key}" does not declare the server implementation`)
  }

  return Object.freeze({
    feature,
    htmlPolicy: freezeRichTextHtmlPolicy(htmlPolicy),
  })
}
