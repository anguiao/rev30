import type { OpsDeviceType, OpsUserAgent } from '@rev30/contracts'
import Bowser from 'bowser'

const knownDeviceTypes = new Set<OpsDeviceType>(['desktop', 'mobile', 'tablet', 'tv', 'bot'])

function toProduct(product: Bowser.Parser.ParsedResult['browser']) {
  const name = product.name?.trim()
  const version = product.version?.trim()

  return name
    ? {
        name,
        version: version || null,
      }
    : null
}

export function toOpsUserAgent(raw: string | null): OpsUserAgent {
  if (raw === null || raw.trim().length === 0) {
    return null
  }

  const result = Bowser.parse(raw)
  const platformType = result.platform.type

  return {
    raw,
    browser: toProduct(result.browser),
    operatingSystem: toProduct(result.os),
    deviceType:
      platformType && knownDeviceTypes.has(platformType as OpsDeviceType)
        ? (platformType as OpsDeviceType)
        : 'unknown',
  }
}
