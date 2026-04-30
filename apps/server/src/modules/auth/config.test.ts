import { describe, expect, it } from 'vitest'
import { readAuthConfig } from './config'

describe('auth config', () => {
  it('uses development defaults for local and test environments', () => {
    expect(readAuthConfig({ NODE_ENV: 'test' })).toMatchObject({
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 604800,
      secureCookies: false,
    })
  })

  it('requires explicit secrets in production', () => {
    expect(() => readAuthConfig({ NODE_ENV: 'production' })).toThrow(
      'JWT_ACCESS_SECRET is required in production',
    )
  })

  it('reads secrets and expiration seconds from env', () => {
    expect(
      readAuthConfig({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_EXPIRES_IN_SECONDS: '60',
        JWT_REFRESH_EXPIRES_IN_SECONDS: '120',
      }),
    ).toEqual({
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
      accessExpiresInSeconds: 60,
      refreshExpiresInSeconds: 120,
      secureCookies: true,
    })
  })
})
