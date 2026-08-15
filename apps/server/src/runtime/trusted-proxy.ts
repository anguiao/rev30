import { isIP } from 'node:net'

const trustedProxyCidrsEnvName = 'TRUSTED_PROXY_CIDRS'
const ipv4Bits = 32
const ipv6Bits = 128
const ipv4MappedIpv6Prefix = 0xffffn
const ipv4ValueMask = (1n << BigInt(ipv4Bits)) - 1n

export const MAX_X_FORWARDED_FOR_HOPS = 32

export type ClientIpSource = 'socket' | 'x-forwarded-for' | 'unavailable'

export type ForwardedForErrorReason = 'empty-hop' | 'invalid-ip' | 'too-many-hops'

export type ForwardedForError = Readonly<{
  reason: ForwardedForErrorReason
  hopCount?: number
}>

export type ClientIpResolution = Readonly<{
  clientIp: string | null
  clientIpSource: ClientIpSource
  forwardedForError?: ForwardedForError
}>

export type TrustedProxyPolicy = Readonly<{
  isTrusted(address: string): boolean
}>

type IpAddressFamily = 4 | 6

type ParsedIpLiteral = {
  family: IpAddressFamily
  value: bigint
}

type ParsedIpAddress = ParsedIpLiteral & {
  normalized: string
}

type TrustedProxyRange = {
  family: IpAddressFamily
  network: bigint
  prefixLength: number
}

export type ResolveClientIpInput = {
  socketAddress: string | null | undefined
  xForwardedFor: string | null | undefined
  trustedProxyPolicy: TrustedProxyPolicy
}

export function readTrustedProxyPolicy(env = process.env): TrustedProxyPolicy {
  return compileTrustedProxyPolicy(env[trustedProxyCidrsEnvName])
}

export function compileTrustedProxyPolicy(value: string | undefined): TrustedProxyPolicy {
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

export function normalizeIpAddress(value: string | null | undefined): string | null {
  return parseIpAddress(value)?.normalized ?? null
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
  return Object.freeze({
    isTrusted(address) {
      const parsedAddress = parseIpAddress(address)

      return (
        parsedAddress !== null && ranges.some((range) => isAddressInRange(parsedAddress, range))
      )
    },
  })
}

function parseTrustedProxyRange(value: string): TrustedProxyRange | null {
  const slashIndex = value.indexOf('/')

  if (slashIndex === -1) {
    const address = parseIpLiteral(value)

    if (!address) {
      return null
    }

    return normalizeTrustedProxyRange(address, address.family === 4 ? ipv4Bits : ipv6Bits)
  }

  if (
    slashIndex === 0 ||
    slashIndex !== value.lastIndexOf('/') ||
    slashIndex === value.length - 1
  ) {
    return null
  }

  const address = parseIpLiteral(value.slice(0, slashIndex))
  const prefixLength = parsePrefixLength(value.slice(slashIndex + 1), address?.family)

  if (!address || prefixLength === null) {
    return null
  }

  return normalizeTrustedProxyRange(address, prefixLength)
}

function normalizeTrustedProxyRange(
  address: ParsedIpLiteral,
  prefixLength: number,
): TrustedProxyRange {
  if (address.family === 6 && isIpv4MappedIpv6(address.value)) {
    return {
      family: 4,
      network: address.value & ipv4ValueMask,
      prefixLength: prefixLength <= 96 ? 0 : prefixLength - 96,
    }
  }

  return {
    family: address.family,
    network: address.value,
    prefixLength,
  }
}

function parsePrefixLength(value: string, family: IpAddressFamily | undefined): number | null {
  if (!family || !/^(0|[1-9]\d*)$/.test(value)) {
    return null
  }

  const prefixLength = Number(value)
  const maxPrefixLength = family === 4 ? ipv4Bits : ipv6Bits

  if (!Number.isSafeInteger(prefixLength) || prefixLength > maxPrefixLength) {
    return null
  }

  return prefixLength
}

function parseIpAddress(value: string | null | undefined): ParsedIpAddress | null {
  if (value == null) {
    return null
  }

  const literal = parseIpLiteral(value)

  if (!literal) {
    return null
  }

  if (literal.family === 6 && isIpv4MappedIpv6(literal.value)) {
    const ipv4Value = literal.value & ipv4ValueMask

    return {
      family: 4,
      value: ipv4Value,
      normalized: formatIpv4(ipv4Value),
    }
  }

  return {
    ...literal,
    normalized: value,
  }
}

function parseIpLiteral(value: string): ParsedIpLiteral | null {
  if (!value || value.includes('%')) {
    return null
  }

  const family = isIP(value)

  if (family === 4) {
    return {
      family,
      value: parseIpv4(value),
    }
  }

  if (family === 6) {
    return {
      family,
      value: parseIpv6(value),
    }
  }

  return null
}

function parseIpv4(value: string): bigint {
  return value.split('.').reduce((address, octet) => (address << 8n) | BigInt(octet), 0n)
}

function parseIpv6(value: string): bigint {
  const expandedValue = expandEmbeddedIpv4(value)
  const [left, right] = expandedValue.split('::')
  const leftGroups = left ? left.split(':') : []
  const rightGroups = right ? right.split(':') : []
  const groups =
    right === undefined
      ? leftGroups
      : [
          ...leftGroups,
          ...Array(8 - leftGroups.length - rightGroups.length).fill('0'),
          ...rightGroups,
        ]

  return groups.reduce(
    (address, group) => (address << 16n) | BigInt(Number.parseInt(group, 16)),
    0n,
  )
}

function expandEmbeddedIpv4(value: string): string {
  if (!value.includes('.')) {
    return value
  }

  const lastColonIndex = value.lastIndexOf(':')
  const ipv4Value = parseIpv4(value.slice(lastColonIndex + 1))
  const highGroup = (ipv4Value >> 16n).toString(16)
  const lowGroup = (ipv4Value & 0xffffn).toString(16)

  return `${value.slice(0, lastColonIndex + 1)}${highGroup}:${lowGroup}`
}

function isIpv4MappedIpv6(value: bigint): boolean {
  return value >> BigInt(ipv4Bits) === ipv4MappedIpv6Prefix
}

function formatIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join('.')
}

function isAddressInRange(address: ParsedIpAddress, range: TrustedProxyRange): boolean {
  if (address.family !== range.family) {
    return false
  }

  const bitLength = address.family === 4 ? ipv4Bits : ipv6Bits
  const hostBitLength = BigInt(bitLength - range.prefixLength)

  return address.value >> hostBitLength === range.network >> hostBitLength
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
