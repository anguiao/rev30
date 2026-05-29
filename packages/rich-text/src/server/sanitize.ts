import sanitizeHtml from 'sanitize-html'
import type { RichTextHtmlPolicy } from './policy'

const defaultAllowedSchemes = ['http', 'https', 'mailto', 'tel']

function mergeRichTextHtmlPolicies(policies: RichTextHtmlPolicy[]): sanitizeHtml.IOptions {
  const allowedTags = new Set<string>()
  const allowedSchemes = new Set(defaultAllowedSchemes)
  const allowedAttributes: sanitizeHtml.IDefaults['allowedAttributes'] = {}
  const transformTags: NonNullable<sanitizeHtml.IOptions['transformTags']> = {}
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
      Object.assign(transformTags, policy.transformTags)
    }
  }

  return {
    allowedTags: [...allowedTags],
    allowedAttributes,
    allowedSchemes: [...allowedSchemes],
    allowedStyles,
    allowProtocolRelative: false,
    transformTags,
  }
}

export function sanitizeRichTextHtml(html: string, policies: RichTextHtmlPolicy[]) {
  return sanitizeHtml(html, mergeRichTextHtmlPolicies(policies))
}
