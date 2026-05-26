import sanitizeHtml from 'sanitize-html'

export interface RichTextHtmlPolicy {
  allowedTags?: string[]
  allowedAttributes?: sanitizeHtml.IOptions['allowedAttributes']
  allowedSchemes?: string[]
  transformTags?: sanitizeHtml.IOptions['transformTags']
}

export function mergeRichTextHtmlPolicies(policies: RichTextHtmlPolicy[]): sanitizeHtml.IOptions {
  const allowedTags = new Set<string>()
  const allowedSchemes = new Set(['http', 'https', 'mailto', 'tel'])
  const allowedAttributes: Record<string, string[]> = {}
  const transformTags: NonNullable<sanitizeHtml.IOptions['transformTags']> = {}

  for (const policy of policies) {
    for (const tag of policy.allowedTags ?? []) {
      allowedTags.add(tag)
    }

    for (const scheme of policy.allowedSchemes ?? []) {
      allowedSchemes.add(scheme)
    }

    for (const [tag, attributes] of Object.entries(policy.allowedAttributes ?? {})) {
      const current = new Set(allowedAttributes[tag] ?? [])

      for (const attribute of attributes) {
        current.add(attribute)
      }

      allowedAttributes[tag] = [...current]
    }

    Object.assign(transformTags, policy.transformTags)
  }

  return {
    allowedTags: [...allowedTags],
    allowedAttributes,
    allowedSchemes: [...allowedSchemes],
    allowProtocolRelative: false,
    transformTags,
  }
}

export function sanitizeRichTextHtml(html: string, policies: RichTextHtmlPolicy[]) {
  return sanitizeHtml(html, mergeRichTextHtmlPolicies(policies))
}
