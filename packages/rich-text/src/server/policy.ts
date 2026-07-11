import type sanitizeHtml from 'sanitize-html'

export type RichTextTagTransform = (input: sanitizeHtml.Tag) => sanitizeHtml.Tag

export interface RichTextHtmlPolicy {
  readonly allowedTags?: readonly string[]
  readonly allowedAttributes?: Readonly<Record<string, readonly sanitizeHtml.AllowedAttribute[]>>
  readonly allowedSchemes?: readonly string[]
  readonly allowedSchemesByTag?: Readonly<Record<string, readonly string[]>>
  readonly allowedStyles?: Readonly<Record<string, Readonly<Record<string, readonly RegExp[]>>>>
  readonly transformTags?: Readonly<Record<string, readonly RichTextTagTransform[]>>
}

export function freezeRichTextHtmlPolicy(policy: RichTextHtmlPolicy): RichTextHtmlPolicy {
  const allowedAttributes = policy.allowedAttributes
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(policy.allowedAttributes).map(([tag, attributes]) => [
            tag,
            Object.freeze([...attributes]),
          ]),
        ),
      )
    : undefined
  const allowedStyles = policy.allowedStyles
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(policy.allowedStyles).map(([tag, properties]) => [
            tag,
            Object.freeze(
              Object.fromEntries(
                Object.entries(properties).map(([property, patterns]) => [
                  property,
                  Object.freeze([...patterns]),
                ]),
              ),
            ),
          ]),
        ),
      )
    : undefined
  const allowedSchemesByTag = policy.allowedSchemesByTag
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(policy.allowedSchemesByTag).map(([tag, schemes]) => [
            tag,
            Object.freeze([...schemes]),
          ]),
        ),
      )
    : undefined
  const transformTags = policy.transformTags
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(policy.transformTags).map(([tag, transforms]) => [
            tag,
            Object.freeze([...transforms]),
          ]),
        ),
      )
    : undefined

  return Object.freeze({
    ...(policy.allowedTags ? { allowedTags: Object.freeze([...policy.allowedTags]) } : {}),
    ...(allowedAttributes ? { allowedAttributes } : {}),
    ...(policy.allowedSchemes ? { allowedSchemes: Object.freeze([...policy.allowedSchemes]) } : {}),
    ...(allowedSchemesByTag ? { allowedSchemesByTag } : {}),
    ...(allowedStyles ? { allowedStyles } : {}),
    ...(transformTags ? { transformTags } : {}),
  })
}
