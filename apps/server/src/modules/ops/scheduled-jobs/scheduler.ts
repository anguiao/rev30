import type { ScheduledJobTaskKey, ScheduledJobTriggerSource, User } from '@rev30/contracts'
import type { Logger } from 'pino'
import { ScheduledJobStateConflictError } from './errors'
import type { RecoverableScheduledJobRun, ScheduledJobRepository } from './repository'
import type { ScheduledJobRunner } from './runner'

const SCHEDULED_JOB_AUTOMATIC_CAPACITY = 2
const RETRY_MS = 60_000
const MAX_TIMER_DELAY_MS = 2_147_483_647

type SchedulerOptions = {
  executorId: string
  repository: ScheduledJobRepository
  runner: ScheduledJobRunner
  logger: Logger
}

export function createScheduledJobScheduler(options: SchedulerOptions) {
  const recoverableRuns: RecoverableScheduledJobRun[] = []
  const automaticRuns = new Set<string>()
  const manualStarts = new Set<Promise<unknown>>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let pollRequested = false
  let pollPromise: Promise<void> | null = null
  let retryPending = false
  let stopped = false

  function clearWakeTimer() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function setWakeTimer(delayMs: number, retry = false) {
    clearWakeTimer()
    retryPending = retry
    timer = setTimeout(
      () => {
        timer = null
        retryPending = false
        wake()
      },
      Math.min(MAX_TIMER_DELAY_MS, Math.max(0, delayMs)),
    )
  }

  function logSkipped(
    taskKey: ScheduledJobTaskKey,
    triggerSource: ScheduledJobTriggerSource,
    runId: string,
    blockedByRunId: string,
  ) {
    options.logger.info(
      {
        taskKey,
        runId,
        triggerSource,
        executorId: options.executorId,
        activeRunId: blockedByRunId,
      },
      'scheduled job skipped',
    )
  }

  function dispatch(
    taskKey: ScheduledJobTaskKey,
    triggerSource: Extract<ScheduledJobTriggerSource, 'scheduled' | 'recovery'>,
    runId: string,
  ) {
    automaticRuns.add(runId)
    const releaseSlot = () => {
      if (automaticRuns.delete(runId)) wake()
    }
    void options.runner
      .run({
        taskKey,
        runId,
        triggerSource,
        onHandlerSettled: releaseSlot,
        onFinalized: wake,
      })
      .catch((error: unknown) => {
        options.logger.error(
          { err: error, taskKey, runId, triggerSource, executorId: options.executorId },
          'scheduled job runner failed',
        )
        releaseSlot()
      })
  }

  function scheduleFailureRetry(error: unknown) {
    if (stopped) return
    options.logger.error(
      { err: error, executorId: options.executorId },
      'scheduled job scheduler query failed',
    )
    pollRequested = false
    setWakeTimer(RETRY_MS, true)
  }

  async function processRecovery() {
    while (
      !stopped &&
      recoverableRuns.length > 0 &&
      automaticRuns.size < SCHEDULED_JOB_AUTOMATIC_CAPACITY
    ) {
      const run = recoverableRuns[0]!
      const result = await options.repository.claimRecovery({
        run,
        now: new Date(),
      })
      recoverableRuns.shift()
      if (result.blockedByRunId !== null) {
        logSkipped(run.taskKey, 'recovery', result.runId, result.blockedByRunId)
      } else {
        dispatch(run.taskKey, 'recovery', result.runId)
      }
    }
  }

  async function poll() {
    if (stopped) return
    clearWakeTimer()
    try {
      await processRecovery()
      if (stopped) return
      const due = await options.repository.listDueScheduled({ now: new Date() })
      for (const plan of due) {
        if (stopped) return
        if (plan.activeRunId !== null) {
          const result = await options.repository.claimScheduled({
            taskKey: plan.taskKey,
            now: new Date(),
            allowRunning: false,
          })
          if (result && result.blockedByRunId !== null) {
            logSkipped(plan.taskKey, 'scheduled', result.runId, result.blockedByRunId)
          }
          continue
        }
        if (automaticRuns.size >= SCHEDULED_JOB_AUTOMATIC_CAPACITY) continue
        const result = await options.repository.claimScheduled({
          taskKey: plan.taskKey,
          now: new Date(),
        })
        if (result && result.blockedByRunId !== null) {
          logSkipped(plan.taskKey, 'scheduled', result.runId, result.blockedByRunId)
        } else if (result) {
          dispatch(plan.taskKey, 'scheduled', result.runId)
        }
      }
      if (stopped) return
      const nextWakeAt =
        automaticRuns.size >= SCHEDULED_JOB_AUTOMATIC_CAPACITY
          ? await options.repository.findNextActiveScheduledAt()
          : await options.repository.findNextScheduledAt()
      if (nextWakeAt !== null) {
        setWakeTimer(nextWakeAt.getTime() - Date.now())
      }
    } catch (error) {
      scheduleFailureRetry(error)
    }
  }

  function queuePoll() {
    if (stopped) return
    if (pollPromise) {
      pollRequested = true
      return
    }
    pollPromise = (async () => {
      do {
        pollRequested = false
        await poll()
      } while (pollRequested && !stopped)
    })().finally(() => {
      pollPromise = null
    })
  }

  function wake() {
    if (stopped || retryPending) return
    clearWakeTimer()
    queuePoll()
  }

  function start(runs: readonly RecoverableScheduledJobRun[]) {
    recoverableRuns.push(
      ...runs.toSorted(
        (left, right) =>
          left.startedAt.getTime() - right.startedAt.getTime() ||
          left.taskKey.localeCompare(right.taskKey),
      ),
    )
    wake()
  }

  async function startManualRun(
    taskKey: ScheduledJobTaskKey,
    actor: Pick<User, 'id' | 'nickname' | 'username'>,
  ) {
    const result = await options.repository.claimManual({
      taskKey,
      actor,
      now: new Date(),
    })
    if (result.blockedByRunId === null) {
      void options.runner
        .run({
          taskKey,
          runId: result.runId,
          triggerSource: 'manual',
          onFinalized: wake,
        })
        .catch((error: unknown) => {
          options.logger.error(
            {
              err: error,
              taskKey,
              runId: result.runId,
              triggerSource: 'manual',
              executorId: options.executorId,
            },
            'scheduled job runner failed',
          )
        })
    } else {
      logSkipped(taskKey, 'manual', result.runId, result.blockedByRunId)
    }
    return result
  }

  async function runManual(input: {
    taskKey: ScheduledJobTaskKey
    actor: Pick<User, 'id' | 'nickname' | 'username'>
  }) {
    if (stopped) throw new ScheduledJobStateConflictError()

    const start = startManualRun(input.taskKey, input.actor)
    manualStarts.add(start)
    try {
      return await start
    } finally {
      manualStarts.delete(start)
    }
  }

  async function requestCancellation(input: {
    taskKey: ScheduledJobTaskKey
    runId: string
    actor: Pick<User, 'id' | 'nickname' | 'username'>
  }) {
    const run = await options.repository.requestCancellation({
      ...input,
      now: new Date(),
    })
    const logFields = {
      taskKey: input.taskKey,
      runId: input.runId,
      triggerSource: run.triggerSource,
      executorId: options.executorId,
    }
    options.logger.info(logFields, 'scheduled job cancellation requested')
    if (!options.runner.abort(input.runId)) {
      options.logger.error(logFields, 'scheduled job cancellation controller missing')
    }
    return run
  }

  async function stop() {
    stopped = true
    clearWakeTimer()
    await Promise.allSettled([pollPromise, ...manualStarts])
    await options.runner.stop()
  }

  return {
    start,
    runManual,
    requestCancellation,
    wake,
    stop,
  }
}

export type ScheduledJobScheduler = ReturnType<typeof createScheduledJobScheduler>
