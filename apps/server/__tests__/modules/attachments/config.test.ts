import { describe, expect, it } from 'vitest'
import { readAttachmentConfig } from '../../../src/modules/attachments/config'

describe('attachment config', () => {
  it('uses development defaults in non-production environments', () => {
    expect(readAttachmentConfig({ NODE_ENV: 'test' })).toEqual({
      signingSecret: 'rev30-development-attachment-signing-secret',
      signedUrlTtlSeconds: 300,
      storageDir: '.attachments/dev',
    })
  })

  it('requires a non-blank signing secret in production', () => {
    expect(() => readAttachmentConfig({ NODE_ENV: 'production' })).toThrow(
      '生产环境必须设置 ATTACHMENT_SIGNING_SECRET',
    )
    expect(() =>
      readAttachmentConfig({
        NODE_ENV: 'production',
        ATTACHMENT_SIGNING_SECRET: '   ',
      }),
    ).toThrow('生产环境必须设置 ATTACHMENT_SIGNING_SECRET')
  })

  it('trims signing secret and reads valid settings', () => {
    expect(
      readAttachmentConfig({
        NODE_ENV: 'production',
        ATTACHMENT_SIGNING_SECRET: '  signing-secret  ',
        ATTACHMENT_SIGNED_URL_TTL_SECONDS: '1e2',
        ATTACHMENT_STORAGE_DIR: '/tmp/attachments',
      }),
    ).toEqual({
      signingSecret: 'signing-secret',
      signedUrlTtlSeconds: 100,
      storageDir: '/tmp/attachments',
    })
  })

  it('rejects invalid signed url ttl', () => {
    expect(() =>
      readAttachmentConfig({
        NODE_ENV: 'test',
        ATTACHMENT_SIGNED_URL_TTL_SECONDS: 'abc',
      }),
    ).toThrow('ATTACHMENT_SIGNED_URL_TTL_SECONDS 必须是正整数')

    expect(() =>
      readAttachmentConfig({
        NODE_ENV: 'test',
        ATTACHMENT_SIGNED_URL_TTL_SECONDS: '30',
      }),
    ).toThrow('ATTACHMENT_SIGNED_URL_TTL_SECONDS 不能小于 60')
  })
})
