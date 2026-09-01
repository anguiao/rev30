import type { Logger } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScheduledJobExecutionError } from '../../../../src/modules/ops/scheduled-jobs/errors'
import type { ScheduledJobRunCompletion } from '../../../../src/modules/ops/scheduled-jobs/repository'
import { createScheduledJobRunner } from '../../../../src/modules/ops/scheduled-jobs/runner'
import {
  scheduledJobTaskKeys,
  type ScheduledJobDefinition,
} from '../../../../src/modules/ops/scheduled-jobs/registry'
import { createScheduledJobRepositoryMock } from './helpers'

const taskKey = scheduledJobTaskKeys[0]
const runId = '10000000-0000-7000-8000-000000000001'
const executorId = '20000000-0000-4000-8000-000000000001'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function setup(run: ScheduledJobDefinition['run']) {
  const runLogger = { info: vi.fn(), error: vi.fn() } as unknown as Logger
  const child = vi.fn(() => runLogger)
  const logger = { child } as unknown as Logger
  const finalizeRun = vi
    .fn()
    .mockImplementation(
      async ({ completion }: { completion: ScheduledJobRunCompletion }) => completion,
    )
  const repository = createScheduledJobRepositoryMock({ finalizeRun })
  const definition = { key: taskKey, name: 'Task', description: 'Task', run }
  const registry = { get: vi.fn(() => definition), keys: vi.fn(() => [taskKey]) }
  const runner = createScheduledJobRunner({
    executorId,
    registry,
    repository,
    logger,
  })

  return { child, finalizeRun, logger, runLogger, runner }
}

describe('scheduled job runner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T00:00:01.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [
      { deletedCount: 3, failedCount: 0 },
      { status: 'success', deletedCount: 3, failedCount: 0 },
    ],
    [
      { deletedCount: 3, failedCount: 2 },
      {
        status: 'failure',
        deletedCount: 3,
        failedCount: 2,
        errorCategory: 'partial_failure',
        errorSummary: 'Scheduled job completed with failed items',
      },
    ],
  ] as const)('maps a strict handler result to a safe completion', async (result, expected) => {
    const onHandlerSettled = vi.fn()
    const context = setup(vi.fn().mockImplementation(async () => result))
    vi.setSystemTime(new Date('2026-08-25T00:00:02.000Z'))

    await context.runner.run({ taskKey, runId, triggerSource: 'scheduled', onHandlerSettled })

    expect(context.finalizeRun).toHaveBeenCalledWith({
      taskKey,
      runId,
      completion: expect.objectContaining({
        ...expected,
        finishedAt: new Date('2026-08-25T00:00:02.000Z'),
        durationMs: expect.any(Number),
      }),
    })
    expect(onHandlerSettled).toHaveBeenCalledOnce()
    expect(context.child).toHaveBeenCalledWith({
      taskKey,
      runId,
      triggerSource: 'scheduled',
      executorId,
    })
    expect(context.runner.abort(runId)).toBe(false)
  })

  it.each([
    [
      new ScheduledJobExecutionError('database'),
      'database',
      'Scheduled job database operation failed',
    ],
    [
      new ScheduledJobExecutionError('storage'),
      'storage',
      'Scheduled job storage operation failed',
    ],
    [
      new Error('postgres://user:secret@host/private/path'),
      'internal',
      'Scheduled job execution failed',
    ],
    [
      { deletedCount: 1, failedCount: 0, rawError: 'token=secret' },
      'internal',
      'Scheduled job execution failed',
    ],
  ] as const)(
    'maps thrown and invalid results without persisting sensitive details',
    async (value, category, summary) => {
      const handler =
        value instanceof Error ? vi.fn().mockRejectedValue(value) : vi.fn().mockResolvedValue(value)
      const context = setup(handler)

      await context.runner.run({ taskKey, runId, triggerSource: 'manual' })

      const completion = context.finalizeRun.mock.calls[0]![0]
        .completion as ScheduledJobRunCompletion
      expect(completion).toMatchObject({
        status: 'failure',
        deletedCount: null,
        failedCount: null,
        errorCategory: category,
        errorSummary: summary,
      })
      expect(JSON.stringify(completion)).not.toContain('secret')
      expect(context.runLogger.error).toHaveBeenCalledWith(
        { err: expect.anything() },
        'scheduled job failed',
      )
    },
  )

  it('records a cooperatively aborted handler as cancelled without a false failure log', async () => {
    const handler = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()))
      signal.throwIfAborted()
      return { deletedCount: 0, failedCount: 0 }
    })
    const context = setup(handler)
    context.finalizeRun.mockImplementation(async ({ completion }) => ({
      ...completion,
      status: 'cancelled',
      errorCategory: null,
      errorSummary: null,
    }))
    const running = context.runner.run({ taskKey, runId, triggerSource: 'manual' })
    await vi.advanceTimersByTimeAsync(0)

    expect(context.runner.abort(runId)).toBe(true)
    await running

    expect(context.runLogger.error).not.toHaveBeenCalledWith(
      expect.anything(),
      'scheduled job failed',
    )
    expect(context.runLogger.info).toHaveBeenCalledWith(
      {
        status: 'cancelled',
        deletedCount: null,
        failedCount: null,
      },
      'scheduled job completed',
    )
  })

  it('retries finalization after 60 seconds with one handler call and an unchanged completion', async () => {
    const handler = vi.fn().mockResolvedValue({ deletedCount: 1, failedCount: 0 })
    const context = setup(handler)
    context.finalizeRun
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ status: 'success' })
    const promise = context.runner.run({ taskKey, runId, triggerSource: 'scheduled' })
    await vi.advanceTimersByTimeAsync(0)
    const firstCompletion = context.finalizeRun.mock.calls[0]![0].completion

    expect(handler).toHaveBeenCalledOnce()
    expect(context.runner.abort(runId)).toBe(true)
    expect(context.finalizeRun).toHaveBeenCalledOnce()
    expect(context.runLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'scheduled job finalization failed',
    )

    await vi.advanceTimersByTimeAsync(59_999)
    expect(context.finalizeRun).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await promise
    expect(context.finalizeRun).toHaveBeenCalledTimes(2)
    expect(context.finalizeRun.mock.calls[1]![0].completion).toBe(firstCompletion)
    expect(handler).toHaveBeenCalledOnce()
    expect(context.runner.abort(runId)).toBe(false)
  })

  it('stops a pending finalization retry immediately on close without aborting', async () => {
    const handler = vi.fn().mockResolvedValue({ deletedCount: 0, failedCount: 0 })
    const context = setup(handler)
    context.finalizeRun.mockRejectedValue(new Error('database unavailable'))
    const running = context.runner.run({ taskKey, runId, triggerSource: 'recovery' })
    await vi.advanceTimersByTimeAsync(0)

    expect(context.finalizeRun).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(1)
    const signal = handler.mock.calls[0]![0].signal as AbortSignal
    const stop = context.runner.stop()
    await stop
    await running
    await vi.advanceTimersByTimeAsync(60_000)
    expect(signal.aborted).toBe(false)
    expect(context.finalizeRun).toHaveBeenCalledOnce()
    expect(context.runner.abort(runId)).toBe(true)
  })

  it('waits for an in-flight finalization attempt before stop resolves', async () => {
    const finalization = deferred<{ status: string }>()
    const context = setup(vi.fn().mockResolvedValue({ deletedCount: 0, failedCount: 0 }))
    context.finalizeRun.mockImplementationOnce(() => finalization.promise)
    const running = context.runner.run({ taskKey, runId, triggerSource: 'scheduled' })
    await vi.advanceTimersByTimeAsync(0)

    let stopped = false
    const stop = context.runner.stop().then(() => {
      stopped = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(stopped).toBe(false)

    finalization.resolve({ status: 'success' })
    await running
    await stop
    expect(stopped).toBe(true)
  })
})
