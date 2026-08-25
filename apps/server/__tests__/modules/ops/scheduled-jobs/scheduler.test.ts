import { scheduledJobTaskKeySchema } from '@rev30/contracts'
import type { Logger } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScheduledJobScheduler } from '../../../../src/modules/ops/scheduled-jobs/scheduler'
import type { ScheduledJobRecoveryCandidate } from '../../../../src/modules/ops/scheduled-jobs/repository'

const [firstTask, secondTask, thirdTask, fourthTask] = scheduledJobTaskKeySchema.options
const executorId = '20000000-0000-4000-8000-000000000001'
const now = new Date('2026-08-25T00:00:00.000Z')

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
  const repository = {
    listDueScheduled: vi.fn(async () => [...due]),
    findNextScheduledAt: vi.fn(async () => null as Date | null),
    findNextActiveScheduledAt: vi.fn(async () => null as Date | null),
    claimScheduled: vi.fn(
      async ({ taskKey }: { taskKey: typeof firstTask; allowRunning?: boolean }) => {
        const index = due.findIndex((candidate) => candidate.taskKey === taskKey)
        const candidate = due[index]
        if (!candidate) return { kind: 'stale' as const }
        due.splice(index, 1)
        if (candidate.activeRunId) {
          return {
            kind: 'overlap' as const,
            runId: `overlap-${taskKey}`,
            activeRunId: candidate.activeRunId,
            scheduledFor: candidate.nextRunAt,
          }
        }
        return {
          kind: 'running' as const,
          runId: `run-${++runSequence}`,
          scheduledFor: candidate.nextRunAt,
        }
      },
    ),
    claimRecovery: vi.fn(async ({ candidate }: { candidate: ScheduledJobRecoveryCandidate }) => ({
      kind: 'running' as const,
      runId: `recovery-${candidate.taskKey}`,
      scheduledFor: candidate.scheduledFor,
    })),
  }
  const runner = {
    run: vi.fn(
      async ({ runId, onHandlerSettled }: { runId: string; onHandlerSettled?: () => void }) => {
        if (onHandlerSettled) settlements.set(runId, onHandlerSettled)
      },
    ),
  }
  const logger = { error: vi.fn(), info: vi.fn() } as unknown as Logger
  const scheduler = createScheduledJobScheduler({
    executorId,
    repository,
    runner,
    logger,
    now: () => now,
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

  it('runs at most two automatic jobs and leaves the third due until a slot settles', async () => {
    const context = setup()
    context.scheduler.start([])
    await flush()

    expect(context.runner.run).toHaveBeenCalledTimes(2)
    expect(context.due.map(({ taskKey }) => taskKey)).toEqual([thirdTask])
    expect(context.repository.claimScheduled).toHaveBeenCalledTimes(2)

    context.settlements.get('run-1')!()
    await flush()
    expect(context.runner.run).toHaveBeenCalledTimes(3)
    expect(context.due).toEqual([])
  })

  it('dispatches recovery candidates by startedAt and task key before ordinary due work', async () => {
    const context = setup()
    const candidates: ScheduledJobRecoveryCandidate[] = [
      { originalRunId: '2', taskKey: secondTask!, scheduledFor: null, startedAt: new Date(2) },
      { originalRunId: '1b', taskKey: secondTask!, scheduledFor: null, startedAt: new Date(1) },
      { originalRunId: '1a', taskKey: firstTask!, scheduledFor: null, startedAt: new Date(1) },
    ]
    context.scheduler.start(candidates)
    await flush()

    expect(
      context.repository.claimRecovery.mock.calls.map(([input]) => input.candidate.taskKey),
    ).toEqual([secondTask, firstTask])
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
      kind: 'running'
      runId: string
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

    claim.resolve({ kind: 'running', runId: 'committed-run', scheduledFor: now })
    await stop
    expect(context.runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'committed-run' }),
    )
    expect(stopped).toBe(true)
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

    context.scheduler.wake()
    context.scheduler.wake()
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(2_147_483_647)
    await flush()
    expect(context.repository.listDueScheduled.mock.calls.length).toBeGreaterThan(1)
    expect(vi.getTimerCount()).toBe(1)

    context.repository.findNextScheduledAt.mockResolvedValue(null)
    context.scheduler.wake()
    await flush()
    expect(vi.getTimerCount()).toBe(0)
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
    context.scheduler.wake()
    context.scheduler.wake()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(context.repository.listDueScheduled).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(context.repository.listDueScheduled).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('clears its timer and rejects new claims after stop', async () => {
    const context = setup()
    context.due.splice(0)
    context.repository.findNextScheduledAt.mockResolvedValue(new Date(now.getTime() + 10_000))
    context.scheduler.start([])
    await flush()
    expect(vi.getTimerCount()).toBe(1)
    await context.scheduler.stop()
    context.due.push({ taskKey: firstTask!, nextRunAt: now, activeRunId: null })
    context.scheduler.wake()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(context.repository.claimScheduled).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
