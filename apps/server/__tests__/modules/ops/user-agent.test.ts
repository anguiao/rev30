import { describe, expect, it } from 'vitest'
import { toOpsUserAgent } from '../../../src/modules/ops/user-agent'

describe('ops user agent mapper', () => {
  it.each([
    {
      name: 'desktop',
      raw: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      expected: {
        browser: { name: 'Chrome', version: '127.0.0.0' },
        operatingSystem: { name: 'macOS', version: '10.15.7' },
        deviceType: 'desktop',
      },
    },
    {
      name: 'mobile',
      raw: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36',
      expected: {
        browser: { name: 'Chrome', version: '113.0.0.0' },
        operatingSystem: { name: 'Android', version: '13' },
        deviceType: 'mobile',
      },
    },
    {
      name: 'tablet',
      raw: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      expected: {
        browser: { name: 'Safari', version: '16.5' },
        operatingSystem: { name: 'iOS', version: '16.5' },
        deviceType: 'tablet',
      },
    },
    {
      name: 'unknown',
      raw: 'unrecognized-client',
      expected: {
        browser: null,
        operatingSystem: null,
        deviceType: 'unknown',
      },
    },
  ])('maps $name user agents to the contract shape', ({ raw, expected }) => {
    expect(toOpsUserAgent(raw)).toEqual({ raw, ...expected })
  })

  it.each([null, '', '   '])('maps an empty user agent to null', (raw) => {
    expect(toOpsUserAgent(raw)).toBeNull()
  })
})
