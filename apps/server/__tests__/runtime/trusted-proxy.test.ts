import { describe, expect, it } from 'vitest'
import {
  compileTrustedProxyPolicy,
  normalizeIpAddress,
  readTrustedProxyPolicy,
  resolveClientIp,
} from '../../src/runtime/trusted-proxy'

describe('trusted proxy policy', () => {
  it('defaults to trusting no proxy and ignores a forged X-Forwarded-For header', () => {
    const policy = readTrustedProxyPolicy({ TRUSTED_PROXY_CIDRS: '' })

    expect(Object.isFrozen(policy)).toBe(true)
    expect(policy.isTrusted('127.0.0.1')).toBe(false)
    expect(readTrustedProxyPolicy({}).isTrusted('127.0.0.1')).toBe(false)
    expect(
      resolveClientIp({
        socketAddress: '203.0.113.10',
        xForwardedFor: '198.51.100.8',
        trustedProxyPolicy: policy,
      }),
    ).toEqual({
      clientIp: '203.0.113.10',
      clientIpSource: 'socket',
    })
  })

  it('matches a single address, an IPv4 CIDR, and an IPv6 CIDR', () => {
    const policy = compileTrustedProxyPolicy('192.0.2.10, 10.24.0.0/16, 2001:db8:12::/48')

    expect(policy.isTrusted('192.0.2.10')).toBe(true)
    expect(policy.isTrusted('::ffff:192.0.2.10')).toBe(true)
    expect(policy.isTrusted('192.0.2.11')).toBe(false)
    expect(policy.isTrusted('10.24.255.255')).toBe(true)
    expect(policy.isTrusted('10.25.0.1')).toBe(false)
    expect(policy.isTrusted('2001:db8:12:abcd::1')).toBe(true)
    expect(policy.isTrusted('2001:db8:13::1')).toBe(false)
  })

  it('rejects malformed trusted proxy configuration with only the environment name and item position', () => {
    for (const [value, position] of [
      ['192.168.001.1', 1],
      ['192.0.2.10/33', 1],
      ['192.0.2.10/024', 1],
      ['2001:db8::/129', 1],
      ['2001:db8::/not-a-prefix', 1],
      ['[2001:db8::1]:443', 1],
      ['proxy.internal', 1],
      ['192.0.2.10, , 2001:db8::1', 2],
    ] as const) {
      let error: unknown

      try {
        compileTrustedProxyPolicy(value)
      } catch (caught) {
        error = caught
      }

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(`TRUSTED_PROXY_CIDRS 第 ${position} 项无效`)
      expect((error as Error).message).not.toContain(value)
    }
  })
})

describe('IP address normalization', () => {
  it('normalizes IPv4-mapped IPv6 addresses and rejects non-literals', () => {
    expect(normalizeIpAddress('::ffff:127.0.0.1')).toBe('127.0.0.1')
    expect(normalizeIpAddress('0:0:0:0:0:ffff:192.0.2.4')).toBe('192.0.2.4')
    expect(normalizeIpAddress('fe80::1%en0')).toBeNull()
    expect(normalizeIpAddress('proxy.internal')).toBeNull()
    expect(normalizeIpAddress('192.0.2.4:8080')).toBeNull()
  })
})

describe('client IP resolution', () => {
  const trustedProxyPolicy = compileTrustedProxyPolicy('10.0.0.0/8, 2001:db8:ffff::/48')

  it('selects the first non-trusted address from a trusted multi-proxy chain', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.3',
        xForwardedFor: '198.51.100.42, 10.0.0.2',
        trustedProxyPolicy,
      }),
    ).toEqual({
      clientIp: '198.51.100.42',
      clientIpSource: 'x-forwarded-for',
    })
  })

  it('uses the forwarded address from a trusted single-proxy chain', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.3',
        xForwardedFor: '198.51.100.42',
        trustedProxyPolicy,
      }),
    ).toEqual({
      clientIp: '198.51.100.42',
      clientIpSource: 'x-forwarded-for',
    })
  })

  it('normalizes mapped IPv6 socket and forwarded addresses before matching and returning them', () => {
    expect(
      resolveClientIp({
        socketAddress: '::ffff:10.0.0.3',
        xForwardedFor: '::ffff:198.51.100.42',
        trustedProxyPolicy,
      }),
    ).toEqual({
      clientIp: '198.51.100.42',
      clientIpSource: 'x-forwarded-for',
    })
  })

  it('uses the socket address without a warning when a trusted proxy omits X-Forwarded-For', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.3',
        xForwardedFor: undefined,
        trustedProxyPolicy,
      }),
    ).toEqual({
      clientIp: '10.0.0.3',
      clientIpSource: 'socket',
    })
  })

  it('selects the leftmost address when every address in the trusted chain is trusted', () => {
    expect(
      resolveClientIp({
        socketAddress: '10.0.0.3',
        xForwardedFor: '10.0.0.1, 10.0.0.2',
        trustedProxyPolicy,
      }),
    ).toEqual({
      clientIp: '10.0.0.1',
      clientIpSource: 'x-forwarded-for',
    })
  })

  it('never trusts forwarded addresses from an untrusted direct peer', () => {
    expect(
      resolveClientIp({
        socketAddress: '203.0.113.10',
        xForwardedFor: '10.0.0.1',
        trustedProxyPolicy,
      }),
    ).toEqual({
      clientIp: '203.0.113.10',
      clientIpSource: 'socket',
    })
  })

  it.each([
    ['an empty header', '', 'empty-hop', 1],
    ['an empty hop', '198.51.100.42, , 10.0.0.2', 'empty-hop', 3],
    ['an invalid hop', '198.51.100.42, proxy.internal', 'invalid-ip', 2],
    [
      'more than 32 hops',
      Array.from({ length: 33 }, () => '198.51.100.42').join(','),
      'too-many-hops',
      33,
    ],
  ] as const)(
    'falls back to the socket address when X-Forwarded-For contains %s',
    (_name, xForwardedFor, reason, hopCount) => {
      const resolution = resolveClientIp({
        socketAddress: '10.0.0.3',
        xForwardedFor,
        trustedProxyPolicy,
      })

      expect(resolution).toEqual({
        clientIp: '10.0.0.3',
        clientIpSource: 'socket',
        forwardedForError: {
          reason,
          hopCount,
        },
      })
      expect(resolution).not.toHaveProperty('xForwardedFor')

      if (xForwardedFor) {
        expect(JSON.stringify(resolution)).not.toContain(xForwardedFor)
      }
    },
  )

  it('falls back to unavailable without consulting X-Forwarded-For when the socket address is missing', () => {
    expect(
      resolveClientIp({
        socketAddress: undefined,
        xForwardedFor: '198.51.100.42, 10.0.0.2',
        trustedProxyPolicy,
      }),
    ).toEqual({
      clientIp: null,
      clientIpSource: 'unavailable',
    })
  })
})
