import type { Logger } from 'pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduledJobTaskKeySchema } from '@rev30/contracts'
import type { ScheduledJobRetentionConfig } from '../../../../src/modules/ops/scheduled-jobs/config'
import { createProductionScheduledJobRegistry } from '../../../../src/modules/ops/scheduled-jobs/production'

const mocks = vi.hoisted(() => ({
  cleanupAuthSessions: vi.fn(),
  cleanupAuthLoginAttemptBuckets: vi.fn(),
  cleanupLoginLogs: vi.fn(),
  cleanupOperationLogs: vi.fn(),
  cleanupExpiredAttachmentUploadSessions: vi.fn(),
  cleanupUnreferencedAttachments: vi.fn(),
  cleanupOrphanedAttachmentUploads: vi.fn(),
  cleanupScheduledJobRuns: vi.fn(),
  AttachmentCleanupStorageError: class extends Error {
    constructor(readonly cause: unknown) {
      super('Attachment cleanup storage operation failed')
      this.name = 'AttachmentCleanupStorageError'
    }
  },
}))

vi.mock('../../../../src/modules/auth/cleanup', () => ({
  cleanupAuthSessions: mocks.cleanupAuthSessions,
  cleanupAuthLoginAttemptBuckets: mocks.cleanupAuthLoginAttemptBuckets,
}))
vi.mock('../../../../src/modules/ops/login-logs/cleanup', () => ({
  cleanupLoginLogs: mocks.cleanupLoginLogs,
}))
vi.mock('../../../../src/modules/ops/operation-logs/cleanup', () => ({
  cleanupOperationLogs: mocks.cleanupOperationLogs,
}))
vi.mock('../../../../src/modules/attachments/cleanup', () => ({
  cleanupExpiredAttachmentUploadSessions: mocks.cleanupExpiredAttachmentUploadSessions,
  cleanupUnreferencedAttachments: mocks.cleanupUnreferencedAttachments,
  cleanupOrphanedAttachmentUploads: mocks.cleanupOrphanedAttachmentUploads,
  AttachmentCleanupStorageError: mocks.AttachmentCleanupStorageError,
}))
vi.mock('../../../../src/modules/ops/scheduled-jobs/cleanup', () => ({
  cleanupScheduledJobRuns: mocks.cleanupScheduledJobRuns,
}))

const retention: ScheduledJobRetentionConfig = {
  revokedSessionRetentionMs: 1,
  loginAttemptRetentionMs: 2,
  loginLogRetentionMs: 3,
  operationLogRetentionMs: 4,
  attachmentRetentionMs: 5,
  jobRunRetentionMs: 6,
}
const database = {} as never
const storage = { provider: 'test' } as never
const logger = { error: vi.fn() } as unknown as Logger

describe('production scheduled job registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('constructs exactly the eight shared handlers with strict public results', async () => {
    mocks.cleanupAuthSessions.mockResolvedValue(1)
    mocks.cleanupAuthLoginAttemptBuckets.mockResolvedValue(2)
    mocks.cleanupLoginLogs.mockResolvedValue(3)
    mocks.cleanupOperationLogs.mockResolvedValue(4)
    mocks.cleanupExpiredAttachmentUploadSessions.mockResolvedValue({
      deletedCount: 5,
      failedCount: 0,
    })
    mocks.cleanupUnreferencedAttachments.mockResolvedValue({ deletedCount: 6, failedCount: 0 })
    mocks.cleanupOrphanedAttachmentUploads.mockResolvedValue({ deletedCount: 7, failedCount: 0 })
    mocks.cleanupScheduledJobRuns.mockResolvedValue({ deletedCount: 8, failedCount: 0 })

    const registry = createProductionScheduledJobRegistry({ database, storage, retention })
    const signal = new AbortController().signal

    expect(registry.keys()).toEqual(scheduledJobTaskKeySchema.options)
    expect(new Set(registry.keys()).size).toBe(8)

    const results = []
    for (const key of registry.keys()) {
      results.push(await registry.get(key).run({ signal, logger }))
    }

    expect(results).toEqual([
      { deletedCount: 1, failedCount: 0 },
      { deletedCount: 2, failedCount: 0 },
      { deletedCount: 3, failedCount: 0 },
      { deletedCount: 4, failedCount: 0 },
      { deletedCount: 5, failedCount: 0 },
      { deletedCount: 6, failedCount: 0 },
      { deletedCount: 7, failedCount: 0 },
      { deletedCount: 8, failedCount: 0 },
    ])
  })

  it('maps a database boundary failure without returning raw error data', async () => {
    const error = new Error('secret SQL details')
    mocks.cleanupAuthSessions.mockRejectedValueOnce(error)
    const registry = createProductionScheduledJobRegistry({ database, storage, retention })

    await expect(
      registry.get('auth-session-cleanup').run({
        signal: new AbortController().signal,
        logger,
      }),
    ).rejects.toMatchObject({ category: 'database' })
  })

  it('maps attachment storage-list failures to storage without exposing raw data in the summary', async () => {
    const rawError = new Error('secret storage key')
    mocks.cleanupOrphanedAttachmentUploads.mockRejectedValueOnce(
      new mocks.AttachmentCleanupStorageError(rawError),
    )
    const registry = createProductionScheduledJobRegistry({ database, storage, retention })

    await expect(
      registry.get('attachment-orphaned-storage-cleanup').run({
        signal: new AbortController().signal,
        logger,
      }),
    ).rejects.toMatchObject({
      category: 'storage',
      message: 'Scheduled job storage operation failed',
      cause: rawError,
    })
  })

  it('keeps attachment database failures in the database category', async () => {
    mocks.cleanupOrphanedAttachmentUploads.mockRejectedValueOnce(new Error('secret SQL details'))
    const registry = createProductionScheduledJobRegistry({ database, storage, retention })

    await expect(
      registry.get('attachment-orphaned-storage-cleanup').run({
        signal: new AbortController().signal,
        logger,
      }),
    ).rejects.toMatchObject({ category: 'database' })
  })

  it('checks a single SQL handler signal before and after the database boundary', async () => {
    const preAborted = new AbortController()
    preAborted.abort()
    mocks.cleanupAuthSessions.mockResolvedValue(0)
    const registry = createProductionScheduledJobRegistry({ database, storage, retention })

    await expect(
      registry.get('auth-session-cleanup').run({ signal: preAborted.signal, logger }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.cleanupAuthSessions).not.toHaveBeenCalled()

    const postAborted = new AbortController()
    mocks.cleanupAuthSessions.mockImplementationOnce(async () => {
      postAborted.abort()
      return 0
    })

    await expect(
      registry.get('auth-session-cleanup').run({ signal: postAborted.signal, logger }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.cleanupAuthSessions).toHaveBeenCalledOnce()
  })
})
