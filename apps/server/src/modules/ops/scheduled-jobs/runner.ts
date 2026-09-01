import type { ScheduledJobTaskKey, ScheduledJobTriggerSource } from '@rev30/contracts'
import type { Logger } from 'pino'
import type { ScheduledJobRepository, ScheduledJobRunCompletion } from './repository'
import { scheduledJobResultSchema, type ScheduledJobRegistry } from './registry'
import { ScheduledJobExecutionError } from './errors'

const FINALIZATION_RETRY_MS = 60_000

type RunnerOptions = {
  executorId: string
  registry: ScheduledJobRegistry
  repository: ScheduledJobRepository
  logger: Logger
}

type RunInput = {
  taskKey: ScheduledJobTaskKey
  runId: string
  triggerSource: ScheduledJobTriggerSource
  onHandlerSettled?: () => void
  onFinalized?: () => void
}

function failureCompletion(
  error: unknown,
  finishedAt: Date,
  durationMs: number,
): ScheduledJobRunCompletion {
  const category =
    error instanceof ScheduledJobExecutionError ? error.category : ('internal' as const)
  return {
    status: 'failure',
    finishedAt,
    durationMs,
    deletedCount: null,
    failedCount: null,
    errorCategory: category,
    errorSummary:
      error instanceof ScheduledJobExecutionError
        ? error.message
        : 'Scheduled job execution failed',
  }
}

export function createScheduledJobRunner(options: RunnerOptions) {
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

    const startedAt = performance.now()
    let completion: ScheduledJobRunCompletion
    let executionError: unknown
    try {
      const result = scheduledJobResultSchema.parse(
        await options.registry
          .get(input.taskKey)
          .run({ signal: controller.signal, logger: runLogger }),
      )
      const finishedAt = new Date()
      const durationMs = Math.round(performance.now() - startedAt)
      completion =
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
      completion = failureCompletion(error, new Date(), Math.round(performance.now() - startedAt))
    } finally {
      input.onHandlerSettled?.()
    }

    while (true) {
      let finalized
      try {
        finalized = await options.repository.finalizeRun({
          taskKey: input.taskKey,
          runId: input.runId,
          completion,
        })
      } catch (error) {
        runLogger.error({ err: error }, 'scheduled job finalization failed')
        if (!(await waitForRetry())) return
        continue
      }

      controllers.delete(input.runId)
      input.onFinalized?.()
      if (finalized.status === 'failure') {
        const fields = executionError
          ? {
              err:
                executionError instanceof ScheduledJobExecutionError
                  ? (executionError.cause ?? executionError)
                  : executionError,
            }
          : {
              errorCategory: finalized.errorCategory,
              deletedCount: finalized.deletedCount,
              failedCount: finalized.failedCount,
            }
        runLogger.error(fields, 'scheduled job failed')
      } else {
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
