import { opsDeviceTypeSchema, type OpsUserAgent } from '@rev30/contracts'
import Bowser from 'bowser'

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
  const deviceType = opsDeviceTypeSchema.safeParse(result.platform.type)

  return {
    raw,
    browser: toProduct(result.browser),
    operatingSystem: toProduct(result.os),
    deviceType: deviceType.success ? deviceType.data : 'unknown',
  }
}
