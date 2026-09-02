import type { ScheduledJobTaskKey } from '@rev30/contracts'
import type { Logger } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { opsJobRuns } from '../../../../src/db/schema'
import {
  ScheduledJobNotFoundError,
  ScheduledJobStateConflictError,
} from '../../../../src/modules/ops/scheduled-jobs/errors'
import type {
  RecoverableScheduledJobRun,
  ScheduledJobRepository,
} from '../../../../src/modules/ops/scheduled-jobs/repository'
import { scheduledJobTaskKeys } from '../../../../src/modules/ops/scheduled-jobs/registry'
import { createScheduledJobScheduler } from '../../../../src/modules/ops/scheduled-jobs/scheduler'
import { createScheduledJobRepositoryMock } from './helpers'

const firstTask: ScheduledJobTaskKey = scheduledJobTaskKeys[0]
const secondTask: ScheduledJobTaskKey = scheduledJobTaskKeys[1]
const thirdTask: ScheduledJobTaskKey = scheduledJobTaskKeys[2]
const fourthTask: ScheduledJobTaskKey = scheduledJobTaskKeys[3]
const runId = '10000000-0000-7000-8000-000000000001'
const executorId = '20000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-25T00:00:00.000Z')
const actor = {
  id: '30000000-0000-4000-8000-000000000001',
  username: 'operator',
  nickname: 'Operator',
}
const cancellationRun = {
  id: runId,
  taskKey: firstTask,
  triggerSource: 'manual',
  status: 'running',
  scheduledFor: null,
  deletedCount: null,
  failedCount: null,
  errorCategory: null,
  errorSummary: null,
  triggeredByUserId: actor.id,
  triggeredByUsername: actor.username,
  triggeredByNickname: actor.nickname,
  cancelRequestedAt: now,
  cancelRequestedByUserId: actor.id,
  cancelRequestedByUsername: actor.username,
  cancelRequestedByNickname: actor.nickname,
  startedAt: now,
  finishedAt: null,
  durationMs: null,
  createdAt: now,
} satisfies typeof opsJobRuns.$inferSelect

async function flush() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function setup() {
  const due = [firstTask!, secondTask!, thirdTask!].map((taskKey) => ({
    taskKey,
    nextRunAt: now,
    activeRunId: null as string | null,
  }))
  const settlements = new Map<string, () => void>()
  let runSequence = 0
  const repository = createScheduledJobRepositoryMock({
    listDueScheduled: vi.fn(async () => [...due]),
    findNextScheduledAt: vi.fn(async () => null as Date | null),
    findNextActiveScheduledAt: vi.fn(async () => null as Date | null),
    claimScheduled: vi.fn(
      async ({ taskKey }: { taskKey: typeof firstTask; allowRunning?: boolean }) => {
        const index = due.findIndex((plan) => plan.taskKey === taskKey)
        const plan = due[index]
        if (!plan) return null
        due.splice(index, 1)
        if (plan.activeRunId) {
          return {
            runId: `overlap-${taskKey}`,
            blockedByRunId: plan.activeRunId,
            scheduledFor: plan.nextRunAt,
          }
        }
        return {
          runId: `run-${++runSequence}`,
          blockedByRunId: null,
          scheduledFor: plan.nextRunAt,
        }
      },
    ),
    claimRecovery: vi.fn(async ({ run }: { run: RecoverableScheduledJobRun }) => ({
      runId: `recovery-${run.taskKey}`,
      blockedByRunId: null,
      scheduledFor: run.scheduledFor,
    })),
    claimManual: vi.fn<ScheduledJobRepository['claimManual']>(async () => ({
      runId,
      blockedByRunId: null,
      scheduledFor: null,
    })),
    requestCancellation: vi.fn<ScheduledJobRepository['requestCancellation']>(
      async () => cancellationRun,
    ),
  })
  const runner = {
    run: vi.fn(
      async ({ runId, onHandlerSettled }: { runId: string; onHandlerSettled?: () => void }) => {
        if (onHandlerSettled) settlements.set(runId, onHandlerSettled)
      },
    ),
    abort: vi.fn(() => false),
    stop: vi.fn(async () => undefined),
  }
  const logger = { error: vi.fn(), info: vi.fn() } as unknown as Logger
  const scheduler = createScheduledJobScheduler({
    executorId,
    repository,
    runner,
    logger,
  })
  return { due, logger, repository, runner, scheduler, settlements }
}

describe('scheduled job scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a safe independent diagnostic snapshot across start and stop', async () => {
    const context = setup()
    context.due.splice(0)
    const initial = context.scheduler.diagnostics()
    expect(initial).toEqual({
      runtimeStatus: 'stopped',
      automaticCapacity: 2,
      automaticRunning: 0,
      manualStarting: 0,
      recoveryQueued: 0,
      retryPending: false,
      nextWakeAt: null,
      lastPollAt: null,
      lastPollStatus: null,
    })
    initial.automaticRunning = 99
    expect(context.scheduler.diagnostics().automaticRunning).toBe(0)
    context.scheduler.start([])
    expect(context.scheduler.diagnostics().runtimeStatus).toBe('running')
    await flush()
    expect(context.scheduler.diagnostics()).toMatchObject({
      lastPollAt: now.toISOString(),
      lastPollStatus: 'success',
      nextWakeAt: null,
    })
    const stop = context.scheduler.stop()
    expect(context.scheduler.diagnostics().runtimeStatus).toBe('stopped')
    await stop
  })

  it('runs at most two automatic jobs and leaves the third due until a slot settles', async () => {
    const context = setup()
    context.scheduler.start([])
    await flush()

    expect(context.scheduler.diagnostics().automaticRunning).toBe(2)
    expect(context.runner.run).toHaveBeenCalledTimes(2)
    expect(context.due.map(({ taskKey }) => taskKey)).toEqual([thirdTask])
    expect(context.repository.claimScheduled).toHaveBeenCalledTimes(2)

    context.settlements.get('run-1')!()
    expect(context.scheduler.diagnostics().automaticRunning).toBe(1)
    await flush()
    expect(context.runner.run).toHaveBeenCalledTimes(3)
    expect(context.due).toEqual([])
    expect(context.scheduler.diagnostics().automaticRunning).toBe(2)
  })

  it('dispatches recoverable runs by startedAt and task key before ordinary due work', async () => {
    const context = setup()
    const runs: RecoverableScheduledJobRun[] = [
      { taskKey: secondTask!, scheduledFor: null, startedAt: new Date(2) },
      { taskKey: secondTask!, scheduledFor: null, startedAt: new Date(1) },
      { taskKey: firstTask!, scheduledFor: null, startedAt: new Date(1) },
    ]
    context.scheduler.start(runs)
    expect(context.scheduler.diagnostics().recoveryQueued).toBe(3)
    await flush()
    expect(context.scheduler.diagnostics().recoveryQueued).toBe(1)

    expect(context.repository.claimRecovery.mock.calls.map(([input]) => input.run.taskKey)).toEqual(
      [secondTask, firstTask],
    )
    expect(context.repository.claimScheduled).not.toHaveBeenCalled()
  })

  it('records due overlap while slots are full without claiming an unoccupied due task', async () => {
    const context = setup()
    context.due.splice(0, context.due.length)
    context.due.push(
      { taskKey: firstTask!, nextRunAt: now, activeRunId: null },
      { taskKey: secondTask!, nextRunAt: now, activeRunId: null },
      { taskKey: thirdTask!, nextRunAt: now, activeRunId: 'active-third' },
      { taskKey: fourthTask!, nextRunAt: now, activeRunId: null },
    )
    context.scheduler.start([])
    await flush()

    expect(context.repository.claimScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: thirdTask, allowRunning: false }),
    )
    expect(context.repository.claimScheduled).not.toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: fourthTask }),
    )
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: thirdTask, triggerSource: 'scheduled' }),
      'scheduled job skipped',
    )
  })

  it('keeps one active-only timer while full and records overlap when the active plan becomes due', async () => {
    const context = setup()
    const activeDueAt = new Date(now.getTime() + 10_000)
    context.repository.findNextActiveScheduledAt.mockResolvedValue(activeDueAt)
    context.scheduler.start([])
    await flush()

    expect(context.runner.run).toHaveBeenCalledTimes(2)
    expect(context.due.map(({ taskKey }) => taskKey)).toEqual([thirdTask])
    expect(vi.getTimerCount()).toBe(1)

    context.due.push({ taskKey: firstTask!, nextRunAt: activeDueAt, activeRunId: 'run-1' })
    context.repository.findNextActiveScheduledAt.mockResolvedValue(null)
    await vi.advanceTimersByTimeAsync(10_000)
    await flush()

    expect(context.repository.claimScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: firstTask, allowRunning: false }),
    )
    expect(context.due.map(({ taskKey }) => taskKey)).toEqual([thirdTask])
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: firstTask, triggerSource: 'scheduled' }),
      'scheduled job skipped',
    )
  })

  it('waits for an in-flight claim during stop and dispatches a committed claim before draining', async () => {
    const context = setup()
    const claim = deferred<{
      runId: string
      blockedByRunId: null
      scheduledFor: Date
    }>()
    context.repository.claimScheduled.mockImplementationOnce(() => claim.promise)
    context.scheduler.start([])
    await flush()
    expect(context.repository.claimScheduled).toHaveBeenCalledOnce()

    let stopped = false
    const stop = context.scheduler.stop().then(() => {
      stopped = true
    })
    await flush()
    expect(stopped).toBe(false)
    expect(context.scheduler.diagnostics()).toMatchObject({
      runtimeStatus: 'stopped',
      lastPollAt: null,
      lastPollStatus: null,
    })
    vi.setSystemTime(new Date(now.getTime() + 1_000))

    claim.resolve({ runId: 'committed-run', blockedByRunId: null, scheduledFor: now })
    await stop
    expect(context.scheduler.diagnostics()).toMatchObject({
      lastPollAt: new Date(now.getTime() + 1_000).toISOString(),
      lastPollStatus: 'success',
    })
    expect(context.runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'committed-run' }),
    )
    expect(stopped).toBe(true)
  })

  it('waits for an in-flight manual start before stopping the runner', async () => {
    const context = setup()
    context.due.splice(0)
    const claim = deferred<{
      runId: string
      blockedByRunId: null
      scheduledFor: null
    }>()
    context.repository.claimManual.mockImplementationOnce(() => claim.promise)

    const manualRun = context.scheduler.runManual({ taskKey: firstTask, actor })
    expect(context.scheduler.diagnostics().manualStarting).toBe(1)
    const stop = context.scheduler.stop()
    await flush()
    expect(context.runner.stop).not.toHaveBeenCalled()

    claim.resolve({ runId, blockedByRunId: null, scheduledFor: null })
    await manualRun
    expect(context.scheduler.diagnostics().manualStarting).toBe(0)
    await stop

    expect(context.runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: firstTask, runId, triggerSource: 'manual' }),
    )
    expect(context.runner.run.mock.invocationCallOrder[0]).toBeLessThan(
      context.runner.stop.mock.invocationCallOrder[0]!,
    )
  })

  it('uses one timer, segments waits beyond the Node limit, and leaves disabled state timer-free', async () => {
    const context = setup()
    context.due.splice(0)
    context.repository.findNextScheduledAt.mockResolvedValue(
      new Date(now.getTime() + 2_147_483_647 + 5_000),
    )
    context.scheduler.start([])
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    expect(context.scheduler.diagnostics().nextWakeAt).toBe(
      new Date(now.getTime() + 2_147_483_647).toISOString(),
    )

    context.scheduler.wake()
    context.scheduler.wake()
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(2_147_483_647)
    await flush()
    expect(context.repository.listDueScheduled.mock.calls.length).toBeGreaterThan(1)
    expect(vi.getTimerCount()).toBe(1)
    expect(context.scheduler.diagnostics().nextWakeAt).toBe(
      new Date(now.getTime() + 2_147_483_647 + 5_000).toISOString(),
    )

    context.repository.findNextScheduledAt.mockResolvedValue(null)
    context.scheduler.wake()
    await flush()
    expect(vi.getTimerCount()).toBe(0)
    expect(context.scheduler.diagnostics().nextWakeAt).toBeNull()
  })

  it('logs a safe query failure and installs one 60-second retry timer', async () => {
    const context = setup()
    const failure = new Error('database unavailable')
    context.repository.listDueScheduled.mockRejectedValue(failure)
    context.scheduler.start([])
    await flush()

    expect(context.logger.error).toHaveBeenCalledWith(
      { err: failure, executorId },
      'scheduled job scheduler query failed',
    )
    expect(vi.getTimerCount()).toBe(1)
    expect(context.scheduler.diagnostics()).toMatchObject({
      retryPending: true,
      lastPollAt: now.toISOString(),
      lastPollStatus: 'failure',
      nextWakeAt: new Date(now.getTime() + 60_000).toISOString(),
    })
    context.scheduler.wake()
    context.scheduler.wake()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(context.repository.listDueScheduled).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(context.repository.listDueScheduled).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
    context.repository.listDueScheduled.mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(60_000)
    await flush()
    expect(context.scheduler.diagnostics()).toMatchObject({
      retryPending: false,
      lastPollAt: new Date(now.getTime() + 120_000).toISOString(),
      lastPollStatus: 'success',
      nextWakeAt: null,
    })
    context.repository.listDueScheduled.mockRejectedValueOnce(failure)
    context.scheduler.wake()
    await flush()
    const stop = context.scheduler.stop()
    expect(context.scheduler.diagnostics()).toMatchObject({
      runtimeStatus: 'stopped',
      retryPending: false,
      nextWakeAt: null,
      lastPollStatus: 'failure',
    })
    await stop
  })

  it('releases the automatic slot and logs an unexpected runner failure', async () => {
    const context = setup()
    const failure = new Error('runner failed')
    context.due.splice(1)
    context.runner.run.mockRejectedValueOnce(failure)

    context.scheduler.start([])
    await flush()

    expect(context.logger.error).toHaveBeenCalledWith(
      {
        err: failure,
        taskKey: firstTask,
        runId: 'run-1',
        triggerSource: 'scheduled',
        executorId,
      },
      'scheduled job runner failed',
    )
    expect(context.runner.run).toHaveBeenCalledOnce()
  })

  it('dispatches manual claims and reports overlaps without consuming automatic slots', async () => {
    const context = setup()
    context.due.splice(0)
    context.scheduler.start([])
    await flush()

    await expect(context.scheduler.runManual({ taskKey: firstTask, actor })).resolves.toEqual({
      runId,
      blockedByRunId: null,
      scheduledFor: null,
    })
    expect(context.runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: firstTask, runId, triggerSource: 'manual' }),
    )

    context.repository.claimManual.mockResolvedValueOnce({
      runId: 'skipped-run',
      blockedByRunId: 'active-run',
      scheduledFor: null,
    })
    await expect(context.scheduler.runManual({ taskKey: firstTask, actor })).resolves.toMatchObject(
      {
        blockedByRunId: 'active-run',
      },
    )
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        taskKey: firstTask,
        runId: 'skipped-run',
        triggerSource: 'manual',
        executorId,
      }),
      'scheduled job skipped',
    )
  })

  it('propagates manual claim errors', async () => {
    const context = setup()
    context.due.splice(0)
    context.scheduler.start([])
    context.repository.claimManual.mockRejectedValueOnce(new ScheduledJobNotFoundError())

    await expect(context.scheduler.runManual({ taskKey: firstTask, actor })).rejects.toBeInstanceOf(
      ScheduledJobNotFoundError,
    )
  })

  it('rejects manual execution after stop begins without claiming a run', async () => {
    const context = setup()
    context.due.splice(0)
    const stop = context.scheduler.stop()

    await expect(context.scheduler.runManual({ taskKey: firstTask, actor })).rejects.toBeInstanceOf(
      ScheduledJobStateConflictError,
    )
    expect(context.repository.claimManual).not.toHaveBeenCalled()
    expect(context.runner.run).not.toHaveBeenCalled()
    await stop
  })

  it('aborts only after a committed cancellation request and reports a missing controller', async () => {
    const context = setup()
    context.runner.abort.mockReturnValueOnce(true).mockReturnValueOnce(false)

    await context.scheduler.requestCancellation({ taskKey: firstTask, runId, actor })
    expect(context.runner.abort).toHaveBeenCalledWith(runId)
    expect(context.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: firstTask, runId, triggerSource: 'manual', executorId }),
      'scheduled job cancellation requested',
    )

    context.repository.requestCancellation.mockResolvedValueOnce({
      ...cancellationRun,
      id: 'missing-controller',
      triggerSource: 'scheduled',
      scheduledFor: now,
      triggeredByUserId: null,
      triggeredByUsername: null,
      triggeredByNickname: null,
    })
    await context.scheduler.requestCancellation({
      taskKey: firstTask,
      runId: 'missing-controller',
      actor,
    })
    expect(context.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ taskKey: firstTask, runId: 'missing-controller' }),
      'scheduled job cancellation controller missing',
    )
  })

  it('clears its timer and stops automatic claims without aborting active runs', async () => {
    const context = setup()
    context.due.splice(0)
    context.repository.findNextScheduledAt.mockResolvedValue(new Date(now.getTime() + 10_000))
    context.scheduler.start([])
    await flush()
    expect(vi.getTimerCount()).toBe(1)

    expect(context.scheduler.diagnostics().nextWakeAt).toBe(
      new Date(now.getTime() + 10_000).toISOString(),
    )
    const stop = context.scheduler.stop()
    expect(context.scheduler.diagnostics()).toMatchObject({
      runtimeStatus: 'stopped',
      nextWakeAt: null,
    })
    expect(vi.getTimerCount()).toBe(0)
    context.due.push({ taskKey: firstTask!, nextRunAt: now, activeRunId: null })
    context.scheduler.wake()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(context.repository.claimScheduled).not.toHaveBeenCalled()

    await stop
    expect(context.runner.stop).toHaveBeenCalledOnce()
    expect(context.runner.abort).not.toHaveBeenCalled()
  })
})
