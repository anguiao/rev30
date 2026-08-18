import { BlockList, isIP, SocketAddress } from 'node:net'

const trustedProxyCidrsEnvName = 'TRUSTED_PROXY_CIDRS'
const ipv4Bits = 32
const ipv6Bits = 128
const ipv4MappedIpv6Prefix = '::ffff:'

export const MAX_X_FORWARDED_FOR_HOPS = 32

export type ClientIpSource = 'socket' | 'x-forwarded-for' | 'unavailable'

export type ForwardedForErrorReason = 'empty-hop' | 'invalid-ip' | 'too-many-hops'

export type ForwardedForError = Readonly<{
  reason: ForwardedForErrorReason
  hopCount: number
}>

export type ClientIpResolution = Readonly<{
  clientIp: string | null
  clientIpSource: ClientIpSource
  forwardedForError?: ForwardedForError
}>

export type TrustedProxyPolicy = Readonly<{
  isTrusted(address: string): boolean
}>

type IpAddressFamily = 'ipv4' | 'ipv6'

type ParsedIpAddress = {
  family: IpAddressFamily
  normalized: string
  sourceFamily: IpAddressFamily
}

type TrustedProxyRange = {
  address: string
  family: IpAddressFamily
  prefixLength: number
}

type ResolveClientIpInput = {
  socketAddress: string | undefined
  xForwardedFor: string | undefined
  trustedProxyPolicy: TrustedProxyPolicy
}

export function readTrustedProxyPolicy(env = process.env): TrustedProxyPolicy {
  const value = env[trustedProxyCidrsEnvName]

  if (!value?.trim()) {
    return createTrustedProxyPolicy([])
  }

  const ranges = value.split(',').map((entry, index) => {
    const range = parseTrustedProxyRange(entry.trim())

    if (!range) {
      throw new Error(`${trustedProxyCidrsEnvName} 第 ${index + 1} 项无效`)
    }

    return range
  })

  return createTrustedProxyPolicy(ranges)
}

export function resolveClientIp({
  socketAddress,
  xForwardedFor,
  trustedProxyPolicy,
}: ResolveClientIpInput): ClientIpResolution {
  const normalizedSocketAddress = normalizeIpAddress(socketAddress)

  if (!normalizedSocketAddress) {
    return {
      clientIp: null,
      clientIpSource: 'unavailable',
    }
  }

  if (!trustedProxyPolicy.isTrusted(normalizedSocketAddress) || xForwardedFor == null) {
    return socketResolution(normalizedSocketAddress)
  }

  const forwardedFor = parseForwardedFor(xForwardedFor)

  if ('error' in forwardedFor) {
    return {
      ...socketResolution(normalizedSocketAddress),
      forwardedForError: forwardedFor.error,
    }
  }

  const addressChain = [...forwardedFor.addresses, normalizedSocketAddress]

  for (let index = addressChain.length - 1; index >= 0; index -= 1) {
    const address = addressChain[index]!

    if (!trustedProxyPolicy.isTrusted(address)) {
      return {
        clientIp: address,
        clientIpSource: index < forwardedFor.addresses.length ? 'x-forwarded-for' : 'socket',
      }
    }
  }

  return {
    clientIp: addressChain[0]!,
    clientIpSource: 'x-forwarded-for',
  }
}

function createTrustedProxyPolicy(ranges: TrustedProxyRange[]): TrustedProxyPolicy {
  const blockList = new BlockList()

  for (const range of ranges) {
    blockList.addSubnet(range.address, range.prefixLength, range.family)
  }

  return {
    isTrusted(address) {
      const parsedAddress = parseIpAddress(address)

      return (
        parsedAddress !== null && blockList.check(parsedAddress.normalized, parsedAddress.family)
      )
    },
  }
}

function parseTrustedProxyRange(value: string): TrustedProxyRange | null {
  const parts = value.split('/')

  if (parts.length > 2) {
    return null
  }

  const address = parseIpAddress(parts[0])

  if (!address) {
    return null
  }

  const prefixLength =
    parts.length === 1
      ? address.sourceFamily === 'ipv4'
        ? ipv4Bits
        : ipv6Bits
      : parsePrefixLength(parts[1]!, address.sourceFamily)

  if (prefixLength === null) {
    return null
  }

  return normalizeTrustedProxyRange(address, prefixLength)
}

function normalizeTrustedProxyRange(
  address: ParsedIpAddress,
  prefixLength: number,
): TrustedProxyRange {
  if (address.sourceFamily === 'ipv6' && address.family === 'ipv4') {
    return {
      address: address.normalized,
      family: 'ipv4',
      prefixLength: prefixLength <= 96 ? 0 : prefixLength - 96,
    }
  }

  return {
    address: address.normalized,
    family: address.family,
    prefixLength,
  }
}

function parsePrefixLength(value: string, family: IpAddressFamily): number | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    return null
  }

  const prefixLength = Number(value)
  const maxPrefixLength = family === 'ipv4' ? ipv4Bits : ipv6Bits

  if (!Number.isSafeInteger(prefixLength) || prefixLength > maxPrefixLength) {
    return null
  }

  return prefixLength
}

function normalizeIpAddress(value: string | undefined): string | null {
  return parseIpAddress(value)?.normalized ?? null
}

function parseIpAddress(value: string | undefined): ParsedIpAddress | null {
  if (!value || value.includes('%')) {
    return null
  }

  const family = isIP(value)

  if (family === 0) {
    return null
  }

  if (family === 4) {
    return {
      family: 'ipv4',
      normalized: value,
      sourceFamily: 'ipv4',
    }
  }

  const canonicalAddress = new SocketAddress({
    address: value,
    family: 'ipv6',
    port: 0,
  }).address
  const mappedAddress = canonicalAddress.startsWith(ipv4MappedIpv6Prefix)
    ? canonicalAddress.slice(ipv4MappedIpv6Prefix.length)
    : null

  if (mappedAddress && isIP(mappedAddress) === 4) {
    return {
      family: 'ipv4',
      normalized: mappedAddress,
      sourceFamily: 'ipv6',
    }
  }

  return {
    family: 'ipv6',
    normalized: value,
    sourceFamily: 'ipv6',
  }
}

function parseForwardedFor(value: string): { addresses: string[] } | { error: ForwardedForError } {
  const entries = value.split(',')

  if (entries.length > MAX_X_FORWARDED_FOR_HOPS) {
    return {
      error: {
        reason: 'too-many-hops',
        hopCount: entries.length,
      },
    }
  }

  const addresses: string[] = []

  for (const entry of entries) {
    const address = normalizeIpAddress(entry.trim())

    if (!address) {
      return {
        error: {
          reason: entry.trim() ? 'invalid-ip' : 'empty-hop',
          hopCount: entries.length,
        },
      }
    }

    addresses.push(address)
  }

  return { addresses }
}

function socketResolution(socketAddress: string): ClientIpResolution {
  return {
    clientIp: socketAddress,
    clientIpSource: 'socket',
  }
}
