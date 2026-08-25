import type { ScheduledJobTaskKey, ScheduledJobTriggerSource } from '@rev30/contracts'
import type { Logger } from 'pino'
import type { ScheduledJobFinalizeCandidate, createScheduledJobRepository } from './repository'
import { scheduledJobResultSchema, type ScheduledJobRegistry } from './registry'
import { ScheduledJobExecutionError } from './errors'

export { ScheduledJobExecutionError } from './errors'

const FINALIZATION_RETRY_MS = 60_000

const safeErrorSummary = {
  database: 'Scheduled job database operation failed',
  storage: 'Scheduled job storage operation failed',
  internal: 'Scheduled job execution failed',
} as const

type RunnerRepository = Pick<ReturnType<typeof createScheduledJobRepository>, 'finalizeRun'>

type RunnerOptions = {
  executorId: string
  registry: ScheduledJobRegistry
  repository: RunnerRepository
  logger: Logger
  now?: () => Date
  monotonicNow?: () => number
}

type RunInput = {
  taskKey: ScheduledJobTaskKey
  runId: string
  triggerSource: ScheduledJobTriggerSource
  onHandlerSettled?: () => void
  onFinalized?: () => void
}

function safeDuration(startedAt: number, finishedAt: number) {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(finishedAt - startedAt)))
}

function failureCandidate(
  error: unknown,
  finishedAt: Date,
  durationMs: number,
): ScheduledJobFinalizeCandidate {
  const category =
    error instanceof ScheduledJobExecutionError ? error.category : ('internal' as const)
  return {
    status: 'failure',
    finishedAt,
    durationMs,
    deletedCount: null,
    failedCount: null,
    errorCategory: category,
    errorSummary: safeErrorSummary[category],
  }
}

export function createScheduledJobRunner(options: RunnerOptions) {
  const now = options.now ?? (() => new Date())
  const monotonicNow = options.monotonicNow ?? (() => performance.now())
  const controllers = new Map<string, AbortController>()
  const activeRuns = new Set<Promise<void>>()
  const retryWaiters = new Set<() => void>()
  let closing = false

  async function waitForRetry() {
    if (closing) return false
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        retryWaiters.delete(stopWaiting)
        resolve(true)
      }, FINALIZATION_RETRY_MS)
      const stopWaiting = () => {
        clearTimeout(timer)
        resolve(false)
      }
      retryWaiters.add(stopWaiting)
    })
  }

  async function executeRun(input: RunInput) {
    const controller = new AbortController()
    controllers.set(input.runId, controller)
    const runLogger = options.logger.child({
      taskKey: input.taskKey,
      runId: input.runId,
      triggerSource: input.triggerSource,
      executorId: options.executorId,
    })
    runLogger.info('scheduled job started')

    const startedAt = monotonicNow()
    let candidate: ScheduledJobFinalizeCandidate
    let executionError: unknown
    try {
      const result = scheduledJobResultSchema.parse(
        await options.registry
          .get(input.taskKey)
          .run({ signal: controller.signal, logger: runLogger }),
      )
      const finishedAt = now()
      const durationMs = safeDuration(startedAt, monotonicNow())
      candidate =
        result.failedCount === 0
          ? {
              status: 'success',
              finishedAt,
              durationMs,
              deletedCount: result.deletedCount,
              failedCount: 0,
            }
          : {
              status: 'failure',
              finishedAt,
              durationMs,
              deletedCount: result.deletedCount,
              failedCount: result.failedCount,
              errorCategory: 'partial_failure',
              errorSummary: 'Scheduled job completed with failed items',
            }
    } catch (error) {
      executionError = error
      candidate = failureCandidate(error, now(), safeDuration(startedAt, monotonicNow()))
    } finally {
      input.onHandlerSettled?.()
    }

    if (candidate.status === 'failure') {
      const fields = executionError
        ? {
            err:
              executionError instanceof ScheduledJobExecutionError
                ? (executionError.cause ?? executionError)
                : executionError,
          }
        : {
            errorCategory: candidate.errorCategory,
            deletedCount: candidate.deletedCount,
            failedCount: candidate.failedCount,
          }
      runLogger.error(fields, 'scheduled job failed')
    }

    while (true) {
      try {
        const finalized = await options.repository.finalizeRun({
          taskKey: input.taskKey,
          runId: input.runId,
          candidate,
        })
        controllers.delete(input.runId)
        input.onFinalized?.()
        if (finalized.status !== 'failure') {
          runLogger.info(
            {
              status: finalized.status,
              deletedCount: finalized.deletedCount,
              failedCount: finalized.failedCount,
            },
            'scheduled job completed',
          )
        }
        return
      } catch (error) {
        runLogger.error({ err: error }, 'scheduled job finalization failed')
        if (!(await waitForRetry())) return
      }
    }
  }

  function run(input: RunInput) {
    const activeRun = executeRun(input)
    activeRuns.add(activeRun)
    activeRun.finally(() => activeRuns.delete(activeRun)).catch(() => undefined)
    return activeRun
  }

  return {
    run,
    abort(runId: string) {
      const controller = controllers.get(runId)
      if (!controller) return false
      controller.abort()
      return true
    },
    async stop() {
      closing = true
      for (const stopWaiting of retryWaiters) stopWaiting()
      retryWaiters.clear()
      await Promise.all([...activeRuns])
    },
  }
}

export type ScheduledJobRunner = ReturnType<typeof createScheduledJobRunner>
