export const linkDefaultProtocol = 'https'

export const linkAllowedSchemes = ['http', 'https', 'mailto', 'tel'] as const
const linkAllowedProtocols = new Set(linkAllowedSchemes.map((scheme) => `${scheme}:`))

const invalidHrefPattern = /\\|\p{Cc}/u
const protocolPattern = /^[a-z][a-z\d+.-]*:/i
const relativeHrefPattern = /^(?:\/|\.{1,2}\/|[?#])/

export function normalizeLinkHref(value: string, defaultProtocol = linkDefaultProtocol) {
  const href = value.trim()

  if (!href || invalidHrefPattern.test(href) || relativeHrefPattern.test(href)) {
    return ''
  }

  const normalizedHref = protocolPattern.test(href) ? href : `${defaultProtocol}://${href}`

  try {
    return linkAllowedProtocols.has(new URL(normalizedHref).protocol) ? normalizedHref : ''
  } catch {
    return ''
  }
}
