import sanitizeHtml from 'sanitize-html'

export type RichTextTagTransform = (input: sanitizeHtml.Tag) => sanitizeHtml.Tag

export interface RichTextHtmlPolicy {
  readonly allowedTags?: readonly string[]
  readonly allowedAttributes?: Readonly<Record<string, readonly sanitizeHtml.AllowedAttribute[]>>
  readonly allowedSchemes?: readonly string[]
  readonly allowedSchemesByTag?: Readonly<Record<string, readonly string[]>>
  readonly allowedStyles?: Readonly<Record<string, Readonly<Record<string, readonly RegExp[]>>>>
  readonly transformTags?: Readonly<Record<string, readonly RichTextTagTransform[]>>
}

const defaultAllowedSchemes = ['http', 'https', 'mailto', 'tel']
type RichTextTagTransformPipelines = Readonly<Record<string, readonly RichTextTagTransform[]>>

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

function mergeRichTextHtmlPolicies(policies: readonly RichTextHtmlPolicy[]): sanitizeHtml.IOptions {
  const allowedTags = new Set<string>()
  const allowedSchemes = new Set(defaultAllowedSchemes)
  const allowedSchemesByTag: Record<string, Set<string>> = {}
  const allowedAttributes: sanitizeHtml.IDefaults['allowedAttributes'] = {}
  const transformTags: Record<string, RichTextTagTransform[]> = {}
  const allowedStyles: NonNullable<sanitizeHtml.IOptions['allowedStyles']> = {}

  for (const policy of policies) {
    for (const tag of policy.allowedTags ?? []) {
      allowedTags.add(tag)
    }

    for (const scheme of policy.allowedSchemes ?? []) {
      allowedSchemes.add(scheme)
    }

    for (const [tag, schemes] of Object.entries(policy.allowedSchemesByTag ?? {})) {
      const current = (allowedSchemesByTag[tag] ??= new Set())

      for (const scheme of schemes) {
        current.add(scheme)
      }
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
    allowedSchemesByTag: Object.fromEntries(
      Object.entries(allowedSchemesByTag).map(([tag, schemes]) => [tag, [...schemes]]),
    ),
    allowedStyles,
    allowProtocolRelative: false,
    transformTags: toSanitizeHtmlTransformTags(transformTags),
  }
}

export function sanitizeRichTextHtml(html: string, policies: readonly RichTextHtmlPolicy[]) {
  return sanitizeHtml(html, mergeRichTextHtmlPolicies(policies))
}
