import { describe, expect, it } from 'vitest'
import { readAuthConfig } from '../../../src/modules/auth/config'

describe('auth config', () => {
  it('uses development defaults for local and test environments', () => {
    expect(readAuthConfig({ NODE_ENV: 'test' })).toMatchObject({
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 604800,
      secureCookies: false,
    })
  })

  it('uses login failure rate limit defaults', () => {
    expect(readAuthConfig({ NODE_ENV: 'test' })).toMatchObject({
      loginFailureMaxAttempts: 5,
      loginFailureWindowSeconds: 900,
      loginFailureLockSeconds: 900,
    })
  })

  it('reads login failure rate limit settings from env', () => {
    expect(
      readAuthConfig({
        NODE_ENV: 'test',
        AUTH_LOGIN_FAILURE_MAX_ATTEMPTS: '1e3',
        AUTH_LOGIN_FAILURE_WINDOW_SECONDS: '300',
        AUTH_LOGIN_FAILURE_LOCK_SECONDS: '600',
      }),
    ).toMatchObject({
      loginFailureMaxAttempts: 1000,
      loginFailureWindowSeconds: 300,
      loginFailureLockSeconds: 600,
    })
  })

  it('requires explicit secrets in production', () => {
    expect(() => readAuthConfig({ NODE_ENV: 'production' })).toThrow(
      '生产环境必须设置 JWT_ACCESS_SECRET',
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
      loginFailureMaxAttempts: 5,
      loginFailureWindowSeconds: 900,
      loginFailureLockSeconds: 900,
      secureCookies: true,
    })
  })

  it('rejects invalid positive integer settings', () => {
    expect(() =>
      readAuthConfig({
        NODE_ENV: 'test',
        AUTH_LOGIN_FAILURE_MAX_ATTEMPTS: '0',
      }),
    ).toThrow('AUTH_LOGIN_FAILURE_MAX_ATTEMPTS 必须是正整数')

    expect(() =>
      readAuthConfig({
        NODE_ENV: 'test',
        AUTH_LOGIN_FAILURE_MAX_ATTEMPTS: '1.5',
      }),
    ).toThrow('AUTH_LOGIN_FAILURE_MAX_ATTEMPTS 必须是正整数')
  })
})
