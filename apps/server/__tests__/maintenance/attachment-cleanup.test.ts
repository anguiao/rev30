import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanupOrphanedAttachmentUploads: vi.fn(),
  cleanupUnreferencedAttachments: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('../../src/modules/attachments/cleanup', () => ({
  cleanupOrphanedAttachmentUploads: mocks.cleanupOrphanedAttachmentUploads,
  cleanupUnreferencedAttachments: mocks.cleanupUnreferencedAttachments,
}))

vi.mock('../../src/runtime/logger', () => ({
  logger: mocks.logger,
}))

import { startAttachmentCleanup } from '../../src/maintenance/attachment-cleanup'

describe('attachment cleanup maintenance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('ATTACHMENT_CLEANUP_INTERVAL_MS', '50')
    vi.stubEnv('ATTACHMENT_CLEANUP_RETENTION_MS', '70')
    vi.clearAllMocks()
    mocks.cleanupOrphanedAttachmentUploads.mockResolvedValue(2)
    mocks.cleanupUnreferencedAttachments.mockResolvedValue(3)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('runs both attachment cleanup phases with the shared retention', async () => {
    const database = {} as never
    const worker = startAttachmentCleanup(database)

    await vi.advanceTimersByTimeAsync(0)

    expect(mocks.cleanupOrphanedAttachmentUploads).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ provider: 'local' }),
      70,
    )
    expect(mocks.cleanupUnreferencedAttachments).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ provider: 'local' }),
      70,
    )
    expect(mocks.logger.info).toHaveBeenCalledWith(
      { deletedCount: 2 },
      'orphaned attachment upload cleanup completed',
    )
    expect(mocks.logger.info).toHaveBeenCalledWith(
      { deletedCount: 3 },
      'unreferenced attachment cleanup completed',
    )

    await worker.stop()
  })

  it('continues with unreferenced cleanup when orphan cleanup fails', async () => {
    const error = new Error('storage unavailable')
    mocks.cleanupOrphanedAttachmentUploads.mockRejectedValue(error)
    const worker = startAttachmentCleanup({} as never)

    await vi.advanceTimersByTimeAsync(0)

    expect(mocks.cleanupUnreferencedAttachments).toHaveBeenCalledOnce()
    expect(mocks.logger.error).toHaveBeenCalledWith(
      { error },
      'orphaned attachment upload cleanup failed',
    )

    await worker.stop()
  })
})
