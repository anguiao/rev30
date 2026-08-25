import { describe, expect, it } from 'vitest'
import { readScheduledJobRetentionConfig } from '../../../../src/modules/ops/scheduled-jobs/config'

const dayMs = 24 * 60 * 60 * 1000

describe('scheduled job retention config', () => {
  it('reads the documented defaults once at the production boundary', () => {
    expect(readScheduledJobRetentionConfig({ NODE_ENV: 'production' })).toEqual({
      revokedSessionRetentionMs: 7 * dayMs,
      loginAttemptRetentionMs: dayMs,
      loginLogRetentionMs: 90 * dayMs,
      operationLogRetentionMs: 180 * dayMs,
      attachmentRetentionMs: 7 * dayMs,
      jobRunRetentionMs: 90 * dayMs,
    })
  })

  it('allows zero only for the four business retention settings', () => {
    expect(
      readScheduledJobRetentionConfig({
        AUTH_REVOKED_SESSION_RETENTION_MS: '0',
        AUTH_LOGIN_ATTEMPT_RETENTION_MS: '0',
        OPS_LOGIN_LOG_RETENTION_MS: '0',
        OPS_OPERATION_LOG_RETENTION_MS: '0',
      }),
    ).toMatchObject({
      revokedSessionRetentionMs: 0,
      loginAttemptRetentionMs: 0,
      loginLogRetentionMs: 0,
      operationLogRetentionMs: 0,
    })
  })

  it.each([
    ['ATTACHMENT_CLEANUP_RETENTION_MS', '0'],
    ['OPS_JOB_RUN_RETENTION_MS', '0'],
    ['AUTH_REVOKED_SESSION_RETENTION_MS', '-1'],
    ['AUTH_LOGIN_ATTEMPT_RETENTION_MS', '1.5'],
    ['OPS_LOGIN_LOG_RETENTION_MS', `${Number.MAX_SAFE_INTEGER + 1}`],
    ['OPS_OPERATION_LOG_RETENTION_MS', 'invalid'],
    ['ATTACHMENT_CLEANUP_RETENTION_MS', '-1'],
    ['OPS_JOB_RUN_RETENTION_MS', '1.2'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(() => readScheduledJobRetentionConfig({ [name]: value })).toThrow(name)
  })

  it('does not read removed cleanup interval settings', () => {
    expect(
      readScheduledJobRetentionConfig({
        AUTH_SESSION_CLEANUP_INTERVAL_MS: 'not-a-duration',
        AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS: 'not-a-duration',
        OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS: 'not-a-duration',
        OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS: 'not-a-duration',
        ATTACHMENT_CLEANUP_INTERVAL_MS: 'not-a-duration',
      }),
    ).toMatchObject({
      revokedSessionRetentionMs: 7 * dayMs,
      jobRunRetentionMs: 90 * dayMs,
    })
  })
})
