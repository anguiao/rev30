import type { ScheduledJobTaskKey, ScheduledJobTriggerSource } from '@rev30/contracts'
import type { Logger } from 'pino'
import type {
  ScheduledJobClaimResult,
  ScheduledJobDueCandidate,
  ScheduledJobRecoveryCandidate,
  createScheduledJobRepository,
} from './repository'
import type { ScheduledJobRunner } from './runner'

export const SCHEDULED_JOB_AUTOMATIC_CAPACITY = 2
const RETRY_MS = 60_000
const MAX_TIMER_DELAY_MS = 2_147_483_647

type SchedulerRepository = Pick<
  ReturnType<typeof createScheduledJobRepository>,
  | 'claimRecovery'
  | 'claimScheduled'
  | 'findNextActiveScheduledAt'
  | 'findNextScheduledAt'
  | 'listDueScheduled'
>

type SchedulerRunner = Pick<ScheduledJobRunner, 'run'>

type SchedulerOptions = {
  executorId: string
  repository: SchedulerRepository
  runner: SchedulerRunner
  logger: Logger
  now?: () => Date
}

export function createScheduledJobScheduler(options: SchedulerOptions) {
  const now = options.now ?? (() => new Date())
  const recoveryCandidates: ScheduledJobRecoveryCandidate[] = []
  const automaticRuns = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let polling = false
  let pollRequested = false
  let pollDrainPromise: Promise<void> | null = null
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
    result: Extract<ScheduledJobClaimResult, { kind: 'overlap' }>,
  ) {
    options.logger.info(
      {
        taskKey,
        runId: result.runId,
        triggerSource,
        executorId: options.executorId,
        activeRunId: result.activeRunId,
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
    let settled = false
    const releaseSlot = (shouldWake: boolean) => {
      if (settled) return
      settled = true
      automaticRuns.delete(runId)
      if (shouldWake) wake()
    }
    try {
      void options.runner
        .run({
          taskKey,
          runId,
          triggerSource,
          onHandlerSettled: () => releaseSlot(true),
          onFinalized: wake,
        })
        .catch((error: unknown) => {
          releaseSlot(false)
          scheduleFailureRetry(error)
        })
    } catch (error) {
      releaseSlot(false)
      scheduleFailureRetry(error)
    }
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
      recoveryCandidates.length > 0 &&
      automaticRuns.size < SCHEDULED_JOB_AUTOMATIC_CAPACITY
    ) {
      const candidate = recoveryCandidates[0]!
      const result = await options.repository.claimRecovery({
        candidate,
        now: now(),
        executorId: options.executorId,
      })
      recoveryCandidates.shift()
      if (result.kind === 'overlap') {
        logSkipped(candidate.taskKey, 'recovery', result)
      } else {
        dispatch(candidate.taskKey, 'recovery', result.runId)
      }
    }
  }

  async function processDueOverlaps(candidates: ScheduledJobDueCandidate[]) {
    for (const candidate of candidates) {
      if (stopped || candidate.activeRunId === null) continue
      const result = await options.repository.claimScheduled({
        taskKey: candidate.taskKey,
        now: now(),
        executorId: options.executorId,
        allowRunning: false,
      })
      if (result.kind === 'overlap') logSkipped(candidate.taskKey, 'scheduled', result)
    }
  }

  async function processRunnableDue(candidates: ScheduledJobDueCandidate[]) {
    for (const candidate of candidates) {
      if (
        stopped ||
        candidate.activeRunId !== null ||
        automaticRuns.size >= SCHEDULED_JOB_AUTOMATIC_CAPACITY
      ) {
        continue
      }
      const result = await options.repository.claimScheduled({
        taskKey: candidate.taskKey,
        now: now(),
        executorId: options.executorId,
      })
      if (result.kind === 'overlap') {
        logSkipped(candidate.taskKey, 'scheduled', result)
      } else if (result.kind === 'running') {
        dispatch(candidate.taskKey, 'scheduled', result.runId)
      }
    }
  }

  async function poll() {
    if (stopped) return
    clearWakeTimer()
    try {
      await processRecovery()
      if (stopped) return
      const due = await options.repository.listDueScheduled({ now: now() })
      await processDueOverlaps(due)
      await processRunnableDue(due)
      if (
        !stopped &&
        recoveryCandidates.length === 0 &&
        automaticRuns.size < SCHEDULED_JOB_AUTOMATIC_CAPACITY
      ) {
        const nextScheduledAt = await options.repository.findNextScheduledAt()
        if (nextScheduledAt !== null) setWakeTimer(nextScheduledAt.getTime() - now().getTime())
      } else if (!stopped && automaticRuns.size >= SCHEDULED_JOB_AUTOMATIC_CAPACITY) {
        const nextActiveScheduledAt = await options.repository.findNextActiveScheduledAt()
        if (nextActiveScheduledAt !== null) {
          setWakeTimer(nextActiveScheduledAt.getTime() - now().getTime())
        }
      }
    } catch (error) {
      scheduleFailureRetry(error)
    }
  }

  function queuePoll() {
    if (stopped) return
    if (polling) {
      pollRequested = true
      return
    }
    polling = true
    pollDrainPromise = new Promise<void>((resolve) => {
      queueMicrotask(() => {
        void poll().finally(() => {
          polling = false
          if (pollRequested) {
            pollRequested = false
            queuePoll()
          }
          resolve()
        })
      })
    })
  }

  function wake() {
    if (stopped || retryPending) return
    clearWakeTimer()
    queuePoll()
  }

  return {
    start(candidates: readonly ScheduledJobRecoveryCandidate[]) {
      recoveryCandidates.push(
        ...candidates.toSorted(
          (left, right) =>
            left.startedAt.getTime() - right.startedAt.getTime() ||
            left.taskKey.localeCompare(right.taskKey),
        ),
      )
      wake()
    },
    wake,
    async stop() {
      stopped = true
      pollRequested = false
      retryPending = false
      clearWakeTimer()
      await pollDrainPromise
    },
  }
}

export type ScheduledJobScheduler = ReturnType<typeof createScheduledJobScheduler>
