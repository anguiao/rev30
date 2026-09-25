import { describe, expect, it } from 'vitest'
import { readAuthConfig } from '../../../src/modules/auth/config'

const maximumCookieLifetimeSeconds = 400 * 24 * 60 * 60

describe('auth config', () => {
  it('uses development defaults for local and test environments', () => {
    expect(readAuthConfig({ NODE_ENV: 'test' })).toMatchObject({
      accessExpiresInSeconds: 900,
      refreshExpiresInSeconds: 604800,
      attachmentSecret: 'rev30-development-attachment-secret',
      attachmentExpiresInSeconds: 86400,
      secureCookies: false,
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
        JWT_ATTACHMENT_SECRET: 'attachment-secret',
        JWT_ACCESS_EXPIRES_IN_SECONDS: '60',
        JWT_REFRESH_EXPIRES_IN_SECONDS: '120',
        JWT_ATTACHMENT_EXPIRES_IN_SECONDS: '90',
      }),
    ).toEqual({
      accessSecret: 'access-secret',
      refreshSecret: 'refresh-secret',
      attachmentSecret: 'attachment-secret',
      accessExpiresInSeconds: 60,
      refreshExpiresInSeconds: 120,
      attachmentExpiresInSeconds: 90,
      secureCookies: true,
    })
  })

  it('reads attachment token settings independently from refresh sessions', () => {
    expect(
      readAuthConfig({
        NODE_ENV: 'test',
        JWT_ATTACHMENT_EXPIRES_IN_SECONDS: '3600',
      }),
    ).toMatchObject({
      attachmentSecret: 'rev30-development-attachment-secret',
      attachmentExpiresInSeconds: 3600,
      refreshExpiresInSeconds: 604800,
    })
  })

  it('rejects attachment token lifetimes longer than refresh token lifetimes', () => {
    expect(() =>
      readAuthConfig({
        NODE_ENV: 'test',
        JWT_REFRESH_EXPIRES_IN_SECONDS: '3600',
        JWT_ATTACHMENT_EXPIRES_IN_SECONDS: '7200',
      }),
    ).toThrow('附件读取令牌有效期不能超过刷新令牌有效期')
  })

  it('rejects access token lifetimes that are not shorter than refresh token lifetimes', () => {
    expect(() =>
      readAuthConfig({
        NODE_ENV: 'test',
        JWT_ACCESS_EXPIRES_IN_SECONDS: '3600',
        JWT_REFRESH_EXPIRES_IN_SECONDS: '3600',
      }),
    ).toThrow('访问令牌有效期必须短于刷新令牌有效期')
  })

  it('rejects invalid positive integer settings', () => {
    expect(() =>
      readAuthConfig({
        NODE_ENV: 'test',
        JWT_ACCESS_EXPIRES_IN_SECONDS: '0',
      }),
    ).toThrow('JWT_ACCESS_EXPIRES_IN_SECONDS 必须是正整数')

    expect(() =>
      readAuthConfig({
        NODE_ENV: 'test',
        JWT_ACCESS_EXPIRES_IN_SECONDS: '1.5',
      }),
    ).toThrow('JWT_ACCESS_EXPIRES_IN_SECONDS 必须是正整数')
  })

  it('accepts token lifetimes at the cookie lifetime limit', () => {
    expect(
      readAuthConfig({
        JWT_ACCESS_EXPIRES_IN_SECONDS: String(maximumCookieLifetimeSeconds - 1),
        JWT_REFRESH_EXPIRES_IN_SECONDS: String(maximumCookieLifetimeSeconds),
        JWT_ATTACHMENT_EXPIRES_IN_SECONDS: String(maximumCookieLifetimeSeconds),
      }),
    ).toMatchObject({
      accessExpiresInSeconds: maximumCookieLifetimeSeconds - 1,
      refreshExpiresInSeconds: maximumCookieLifetimeSeconds,
      attachmentExpiresInSeconds: maximumCookieLifetimeSeconds,
    })
  })

  it('rejects refresh token lifetimes exceeding the cookie lifetime limit', () => {
    expect(() =>
      readAuthConfig({
        JWT_REFRESH_EXPIRES_IN_SECONDS: String(maximumCookieLifetimeSeconds + 1),
      }),
    ).toThrow('JWT_REFRESH_EXPIRES_IN_SECONDS 不能超过 400 天')
  })

  it.each([
    'JWT_ACCESS_EXPIRES_IN_SECONDS',
    'JWT_REFRESH_EXPIRES_IN_SECONDS',
    'JWT_ATTACHMENT_EXPIRES_IN_SECONDS',
  ])('rejects unsafe integer lifetimes for %s', (name) => {
    expect(() => readAuthConfig({ [name]: '1e100' })).toThrow(`${name} 必须是正整数`)
  })
})
