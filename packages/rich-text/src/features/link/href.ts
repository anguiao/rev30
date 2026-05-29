export const linkDefaultProtocol = 'https'

export const linkAllowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const protocolPattern = /^[a-z][a-z\d+.-]*:/i

export function normalizeLinkHref(value: string, defaultProtocol = linkDefaultProtocol) {
  const href = value.trim()

  if (!href || href.startsWith('//')) {
    return ''
  }

  if (protocolPattern.test(href)) {
    return href
  }

  return `${defaultProtocol}://${href}`
}

export function isAllowedLinkHref(href: string) {
  if (!href) {
    return false
  }

  try {
    return linkAllowedProtocols.has(new URL(href).protocol)
  } catch {
    return false
  }
}
