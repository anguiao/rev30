import { scheduledJobTaskKeySchema } from '@rev30/contracts'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import {
  createScheduledJobRuntime,
  ScheduledJobRuntimeStoppedError,
} from '../../../../src/modules/ops/scheduled-jobs/runtime'
import type { ScheduledJobActorSnapshot } from '../../../../src/modules/ops/scheduled-jobs/repository'
import type { ScheduledJobDefinition } from '../../../../src/modules/ops/scheduled-jobs/registry'

const taskKey = scheduledJobTaskKeySchema.options[0]!
const runId = '10000000-0000-7000-8000-000000000001'
const executorId = '20000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-25T00:00:00.000Z')
const actor: ScheduledJobActorSnapshot = {
  userId: '30000000-0000-4000-8000-000000000001',
  username: 'operator',
  nickname: 'Operator',
  sessionId: '40000000-0000-4000-8000-000000000001',
  requestId: '50000000-0000-4000-8000-000000000001',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

type MockedHandler = ReturnType<typeof vi.fn<ScheduledJobDefinition['run']>>

function setup(
  handler: MockedHandler = vi.fn<ScheduledJobDefinition['run']>().mockResolvedValue({
    deletedCount: 0,
    failedCount: 0,
  }),
) {
  const runLogger = { info: vi.fn(), error: vi.fn() } as unknown as Logger
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => runLogger),
  } as unknown as Logger
  const interrupted = {
    runId: 'old-run',
    taskKey,
    triggerSource: 'scheduled' as const,
    executorId: 'old-executor',
  }
  const recovery = {
    originalRunId: 'old-run',
    taskKey,
    scheduledFor: now,
    startedAt: now,
  }
  const repository = {
    initialize: vi
      .fn()
      .mockResolvedValue({ recoveryCandidates: [recovery], interruptedRuns: [interrupted] }),
    claimManual: vi.fn().mockResolvedValue({ kind: 'running' as const, runId, scheduledFor: null }),
    requestCancellation: vi.fn().mockResolvedValue({
      kind: 'accepted' as const,
      firstRequest: true,
      run: { id: runId, taskKey, triggerSource: 'manual', executorId },
    }),
    finalizeRun: vi.fn().mockImplementation(async ({ candidate }) => candidate),
  }
  const scheduler = { start: vi.fn(), wake: vi.fn(), stop: vi.fn() }
  const definition = { key: taskKey, name: 'Task', description: 'Task', run: handler }
  const registry = { get: vi.fn(() => definition), keys: vi.fn(() => [taskKey]) }
  const runtime = createScheduledJobRuntime({
    executorId,
    registry,
    repository,
    logger,
    now: () => now,
    createScheduler: () => scheduler,
  })
  return { handler, interrupted, logger, recovery, repository, runLogger, runtime, scheduler }
}

describe('scheduled job runtime', () => {
  it('initializes before scheduling and logs every startup interruption with safe fields', async () => {
    const context = setup()
    await context.runtime.start()

    expect(context.repository.initialize).toHaveBeenCalledWith({
      registry: expect.anything(),
      startupAt: now,
    })
    expect(context.scheduler.start).toHaveBeenCalledWith([context.recovery])
    expect(context.repository.initialize.mock.invocationCallOrder[0]).toBeLessThan(
      context.scheduler.start.mock.invocationCallOrder[0]!,
    )
    expect(context.logger.info).toHaveBeenCalledWith(
      context.interrupted,
      'scheduled job interrupted during startup recovery',
    )
  })

  it('dispatches a successful manual claim immediately without involving automatic slots', async () => {
    const context = setup()
    await context.runtime.start()
    await expect(context.runtime.runManual({ taskKey, actor })).resolves.toEqual({
      kind: 'running',
      runId,
      scheduledFor: null,
    })
    await Promise.resolve()

    expect(context.handler).toHaveBeenCalledOnce()
    expect(context.scheduler.start).toHaveBeenCalledOnce()
    expect(context.scheduler.wake).toHaveBeenCalledOnce()
  })

  it('returns overlap/not-found manual outcomes and logs overlap', async () => {
    const context = setup()
    await context.runtime.start()
    context.repository.claimManual.mockResolvedValueOnce({
      kind: 'overlap',
      runId: 'skipped-run',
      activeRunId: 'active-run',
      scheduledFor: null,
    })
    await expect(context.runtime.runManual({ taskKey, actor })).resolves.toMatchObject({
      kind: 'overlap',
    })
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        taskKey,
        runId: 'skipped-run',
        triggerSource: 'manual',
        executorId,
      }),
      'scheduled job skipped',
    )
    context.repository.claimManual.mockResolvedValueOnce({ kind: 'not-found' })
    await expect(context.runtime.runManual({ taskKey, actor })).resolves.toEqual({
      kind: 'not-found',
    })
  })

  it('aborts only after a committed cancellation request and reports a missing controller invariant', async () => {
    const running = deferred<{ deletedCount: number; failedCount: number }>()
    const context = setup(vi.fn().mockImplementation(() => running.promise))
    await context.runtime.start()
    await context.runtime.runManual({ taskKey, actor })
    const signal = context.handler.mock.calls[0]![0].signal as AbortSignal

    await context.runtime.requestCancellation({ taskKey, runId, actor })
    expect(signal.aborted).toBe(true)
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey, runId, triggerSource: 'manual', executorId }),
      'scheduled job cancellation requested',
    )

    context.repository.requestCancellation.mockResolvedValueOnce({
      kind: 'accepted',
      firstRequest: true,
      run: { id: 'missing-controller', taskKey, triggerSource: 'scheduled', executorId },
    })
    await context.runtime.requestCancellation({ taskKey, runId: 'missing-controller', actor })
    expect(context.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey, runId: 'missing-controller' }),
      'scheduled job cancellation controller missing',
    )
    running.resolve({ deletedCount: 0, failedCount: 0 })
  })

  it('stops new claims, does not abort active handlers, and stops the scheduler first', async () => {
    const running = deferred<{ deletedCount: number; failedCount: number }>()
    const context = setup(vi.fn().mockImplementation(() => running.promise))
    await context.runtime.start()
    await context.runtime.runManual({ taskKey, actor })
    const signal = context.handler.mock.calls[0]![0].signal as AbortSignal
    const stop = context.runtime.stop()

    expect(context.scheduler.stop).toHaveBeenCalledOnce()
    expect(signal.aborted).toBe(false)
    await expect(context.runtime.runManual({ taskKey, actor })).rejects.toBeInstanceOf(
      ScheduledJobRuntimeStoppedError,
    )
    running.resolve({ deletedCount: 0, failedCount: 0 })
    await stop
    expect(signal.aborted).toBe(false)
    expect(context.repository.claimManual).toHaveBeenCalledOnce()
  })

  it('waits for scheduler claim draining before completing runner shutdown', async () => {
    const running = deferred<{ deletedCount: number; failedCount: number }>()
    const schedulerDrain = deferred<void>()
    const context = setup(vi.fn().mockImplementation(() => running.promise))
    context.scheduler.stop.mockImplementationOnce(() => schedulerDrain.promise)
    await context.runtime.start()
    await context.runtime.runManual({ taskKey, actor })
    const stop = context.runtime.stop()
    let stopped = false
    void stop.then(() => {
      stopped = true
    })

    running.resolve({ deletedCount: 0, failedCount: 0 })
    for (let index = 0; index < 30; index += 1) await Promise.resolve()
    expect(stopped).toBe(false)

    schedulerDrain.resolve()
    await stop
    expect(stopped).toBe(true)
  })
})
