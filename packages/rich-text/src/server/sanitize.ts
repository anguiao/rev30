import sanitizeHtml from 'sanitize-html'
import type { RichTextHtmlPolicy } from './policy'

const defaultAllowedSchemes = ['http', 'https', 'mailto', 'tel']

function mergeAllowedStyles(
  target: NonNullable<sanitizeHtml.IOptions['allowedStyles']>,
  source: sanitizeHtml.IOptions['allowedStyles'],
) {
  for (const [tag, properties] of Object.entries(source ?? {})) {
    const current = (target[tag] ??= {})

    for (const [property, patterns] of Object.entries(properties)) {
      current[property] = [...(current[property] ?? []), ...patterns]
    }
  }
}

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

    mergeAllowedStyles(allowedStyles, policy.allowedStyles)

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
