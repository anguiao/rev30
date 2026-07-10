export const linkDefaultProtocol = 'https'

export const linkAllowedSchemes = ['http', 'https', 'mailto', 'tel'] as const
export const linkAllowedProtocols = new Set(linkAllowedSchemes.map((scheme) => `${scheme}:`))

const protocolPattern = /^[a-z][a-z\d+.-]*:/i

function hasControlCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)

    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }

  return false
}

function isSameSiteHref(href: string) {
  if (href.startsWith('//')) {
    return false
  }

  return (
    href.startsWith('/') ||
    href.startsWith('./') ||
    href.startsWith('../') ||
    href.startsWith('#') ||
    href.startsWith('?')
  )
}

function isBareHostWithPort(href: string) {
  const authority = href.split(/[/?#]/, 1)[0]!
  const portSeparatorIndex = authority.lastIndexOf(':')

  if (portSeparatorIndex < 1) {
    return false
  }

  const hostname = authority.slice(0, portSeparatorIndex)
  const port = authority.slice(portSeparatorIndex + 1)

  return (
    /^\d{1,5}$/.test(port) &&
    (hostname === 'localhost' || hostname.includes('.') || /^\[[\da-f:]+\]$/i.test(hostname))
  )
}

export function normalizeLinkHref(value: string, defaultProtocol = linkDefaultProtocol) {
  const href = value.trim()

  if (!href || hasControlCharacter(href) || href.includes('\\') || href.startsWith('//')) {
    return ''
  }

  if (isSameSiteHref(href)) {
    return href
  }

  if (isBareHostWithPort(href)) {
    return `${defaultProtocol}://${href}`
  }

  if (protocolPattern.test(href)) {
    return isAllowedLinkHref(href) ? href : ''
  }

  return `${defaultProtocol}://${href}`
}

export function isAllowedLinkHref(href: string) {
  if (!href || href !== href.trim() || hasControlCharacter(href) || href.includes('\\')) {
    return false
  }

  if (isSameSiteHref(href)) {
    return true
  }

  try {
    const protocol = new URL(href).protocol

    if (!linkAllowedProtocols.has(protocol)) {
      return false
    }

    return !['http:', 'https:'].includes(protocol) || /^https?:\/\//i.test(href)
  } catch {
    return false
  }
}
