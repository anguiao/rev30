import sanitizeHtml from 'sanitize-html'
import type { RichTextHtmlPolicy } from './policy'

const defaultAllowedSchemes = ['http', 'https', 'mailto', 'tel']
type RichTextTagTransformPipelines = NonNullable<RichTextHtmlPolicy['transformTags']>

function toSanitizeHtmlTransformTags(transformTags: RichTextTagTransformPipelines) {
  const sanitizeTransformTags: NonNullable<sanitizeHtml.IOptions['transformTags']> = {}

  for (const [tag, transforms] of Object.entries(transformTags)) {
    sanitizeTransformTags[tag] = (tagName, attribs) =>
      transforms.reduce((current, transform) => transform(current), {
        tagName,
        attribs,
      })
  }

  return sanitizeTransformTags
}

function mergeRichTextHtmlPolicies(policies: RichTextHtmlPolicy[]): sanitizeHtml.IOptions {
  const allowedTags = new Set<string>()
  const allowedSchemes = new Set(defaultAllowedSchemes)
  const allowedAttributes: sanitizeHtml.IDefaults['allowedAttributes'] = {}
  const transformTags: RichTextTagTransformPipelines = {}
  const allowedStyles: NonNullable<sanitizeHtml.IOptions['allowedStyles']> = {}

  for (const policy of policies) {
    for (const tag of policy.allowedTags ?? []) {
      allowedTags.add(tag)
    }

    for (const scheme of policy.allowedSchemes ?? []) {
      allowedSchemes.add(scheme)
    }

    for (const [tag, attributes] of Object.entries(policy.allowedAttributes ?? {})) {
      const current = new Set<sanitizeHtml.AllowedAttribute>(allowedAttributes[tag] ?? [])

      for (const attribute of attributes) {
        current.add(attribute)
      }

      allowedAttributes[tag] = [...current]
    }

    for (const [tag, properties] of Object.entries(policy.allowedStyles ?? {})) {
      for (const [property, patterns] of Object.entries(properties)) {
        const current = new Set<RegExp>(allowedStyles[tag]?.[property] ?? [])

        for (const pattern of patterns) {
          current.add(pattern)
        }

        allowedStyles[tag] = {
          ...allowedStyles[tag],
          [property]: [...current],
        }
      }
    }

    if (policy.transformTags) {
      for (const [tag, transforms] of Object.entries(policy.transformTags)) {
        transformTags[tag] = [...(transformTags[tag] ?? []), ...transforms]
      }
    }
  }

  return {
    allowedTags: [...allowedTags],
    allowedAttributes,
    allowedSchemes: [...allowedSchemes],
    allowedStyles,
    allowProtocolRelative: false,
    transformTags: toSanitizeHtmlTransformTags(transformTags),
  }
}

export function createRichTextHtmlSanitizer(policies: RichTextHtmlPolicy[]) {
  const options = mergeRichTextHtmlPolicies(policies)

  return (html: string) => sanitizeHtml(html, options)
}

export function sanitizeRichTextHtml(html: string, policies: RichTextHtmlPolicy[]) {
  return sanitizeHtml(html, mergeRichTextHtmlPolicies(policies))
}
