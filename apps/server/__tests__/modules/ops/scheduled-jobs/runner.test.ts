import { scheduledJobTaskKeySchema } from '@rev30/contracts'
import type { Logger } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createScheduledJobRunner,
  ScheduledJobExecutionError,
} from '../../../../src/modules/ops/scheduled-jobs/runner'
import type { ScheduledJobFinalizeCandidate } from '../../../../src/modules/ops/scheduled-jobs/repository'
import type { ScheduledJobDefinition } from '../../../../src/modules/ops/scheduled-jobs/registry'

const taskKey = scheduledJobTaskKeySchema.options[0]!
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
      async ({ candidate }: { candidate: ScheduledJobFinalizeCandidate }) => candidate,
    )
  const definition = { key: taskKey, name: 'Task', description: 'Task', run }
  const registry = { get: vi.fn(() => definition), keys: vi.fn(() => [taskKey]) }
  let wall = new Date('2026-08-25T00:00:01.000Z')
  let monotonicCalls = 0
  const runner = createScheduledJobRunner({
    executorId,
    registry,
    repository: { finalizeRun },
    logger,
    now: () => wall,
    monotonicNow: () => (monotonicCalls++ === 0 ? 100 : 350),
  })

  return {
    child,
    finalizeRun,
    logger,
    runLogger,
    runner,
    setClock(nextWall: Date) {
      wall = nextWall
    },
  }
}

describe('scheduled job runner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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
  ] as const)(
    'maps a strict handler result to a safe terminal candidate',
    async (result, expected) => {
      const onHandlerSettled = vi.fn()
      const context = setup(vi.fn().mockImplementation(async () => result))
      context.setClock(new Date('2026-08-25T00:00:02.000Z'))

      await context.runner.run({ taskKey, runId, triggerSource: 'scheduled', onHandlerSettled })

      expect(context.finalizeRun).toHaveBeenCalledWith({
        taskKey,
        runId,
        candidate: expect.objectContaining({
          ...expected,
          finishedAt: new Date('2026-08-25T00:00:02.000Z'),
          durationMs: 250,
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
    },
  )

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

      const candidate = context.finalizeRun.mock.calls[0]![0]
        .candidate as ScheduledJobFinalizeCandidate
      expect(candidate).toMatchObject({
        status: 'failure',
        deletedCount: null,
        failedCount: null,
        errorCategory: category,
        errorSummary: summary,
      })
      expect(JSON.stringify(candidate)).not.toContain('secret')
      expect(context.runLogger.error).toHaveBeenCalledWith(
        { err: expect.anything() },
        'scheduled job failed',
      )
    },
  )

  it('retries finalization after 60 seconds with one handler call and an unchanged candidate', async () => {
    const handler = vi.fn().mockResolvedValue({ deletedCount: 1, failedCount: 0 })
    const context = setup(handler)
    context.finalizeRun
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ status: 'success' })
    const promise = context.runner.run({ taskKey, runId, triggerSource: 'scheduled' })
    await vi.advanceTimersByTimeAsync(0)
    const firstCandidate = context.finalizeRun.mock.calls[0]![0].candidate

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
    expect(context.finalizeRun.mock.calls[1]![0].candidate).toBe(firstCandidate)
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
