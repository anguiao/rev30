import { randomUUID } from 'node:crypto'
import type { ScheduledJobTaskKey } from '@rev30/contracts'
import type { Logger } from 'pino'
import type { Db } from '../../../db'
import type { AttachmentStorage } from '../../attachments/storage'
import { createScheduledJobRepository, type ScheduledJobActorSnapshot } from './repository'
import { createProductionScheduledJobRegistry } from './production'
import type { ScheduledJobRegistry } from './registry'
import type { ScheduledJobRetentionConfig } from './config'
import { createScheduledJobRunner, type ScheduledJobRunner } from './runner'
import { createScheduledJobScheduler, type ScheduledJobScheduler } from './scheduler'

type Repository = ReturnType<typeof createScheduledJobRepository>
type RuntimeRepository = Pick<
  Repository,
  'claimManual' | 'finalizeRun' | 'initialize' | 'requestCancellation'
> &
  Partial<
    Pick<
      Repository,
      | 'claimRecovery'
      | 'claimScheduled'
      | 'findNextActiveScheduledAt'
      | 'findNextScheduledAt'
      | 'listDueScheduled'
    >
  >

type RuntimeScheduler = Pick<ScheduledJobScheduler, 'start' | 'stop' | 'wake'>

export type ScheduledJobRuntimeCommands = {
  listDefinitions(): readonly {
    key: ScheduledJobTaskKey
    name: string
    description: string
  }[]
  runManual(input: {
    taskKey: ScheduledJobTaskKey
    actor: ScheduledJobActorSnapshot
  }): Promise<Awaited<ReturnType<Repository['claimManual']>>>
  requestCancellation(input: {
    taskKey: ScheduledJobTaskKey
    runId: string
    actor: ScheduledJobActorSnapshot
  }): Promise<Awaited<ReturnType<Repository['requestCancellation']>>>
  wake(): void
}

type RuntimeOptions = {
  executorId?: string
  registry: ScheduledJobRegistry
  repository: RuntimeRepository
  logger: Logger
  now?: () => Date
  createScheduler?: (input: {
    executorId: string
    repository: RuntimeRepository
    runner: ScheduledJobRunner
    logger: Logger
    now: () => Date
  }) => RuntimeScheduler
}

export type ProductionScheduledJobRuntimeOptions = Omit<
  RuntimeOptions,
  'registry' | 'repository'
> & {
  database: Db
  storage: AttachmentStorage
  retention: ScheduledJobRetentionConfig
}

export class ScheduledJobRuntimeStoppedError extends Error {
  constructor() {
    super('Scheduled job runtime is not accepting new work')
    this.name = 'ScheduledJobRuntimeStoppedError'
  }
}

export function createScheduledJobRuntime(options: RuntimeOptions) {
  const executorId = options.executorId ?? randomUUID()
  const now = options.now ?? (() => new Date())
  const runner = createScheduledJobRunner({
    executorId,
    registry: options.registry,
    repository: options.repository,
    logger: options.logger,
    now,
  })
  const scheduler = options.createScheduler
    ? options.createScheduler({
        executorId,
        repository: options.repository,
        runner,
        logger: options.logger,
        now,
      })
    : createScheduledJobScheduler({
        executorId,
        repository: options.repository as Repository,
        runner,
        logger: options.logger,
        now,
      })
  const manualClaims = new Set<Promise<void>>()
  let accepting = false
  let stopping = false
  let startPromise: Promise<void> | null = null
  let stopPromise: Promise<void> | null = null

  function assertAccepting() {
    if (!accepting) throw new ScheduledJobRuntimeStoppedError()
  }

  function trackManualClaim<T>(claim: Promise<T>) {
    const tracked = claim.then(
      () => undefined,
      () => undefined,
    )
    manualClaims.add(tracked)
    tracked.finally(() => manualClaims.delete(tracked)).catch(() => undefined)
    return claim
  }

  return {
    executorId,
    listDefinitions() {
      return options.registry.keys().map((key) => {
        const definition = options.registry.get(key)
        return {
          key: definition.key,
          name: definition.name,
          description: definition.description,
        }
      })
    },
    start() {
      if (stopping) return Promise.reject(new ScheduledJobRuntimeStoppedError())
      if (startPromise) return startPromise
      startPromise = (async () => {
        const initialized = await options.repository.initialize({
          registry: options.registry,
          startupAt: now(),
        })
        for (const interrupted of initialized.interruptedRuns) {
          options.logger.info(
            {
              taskKey: interrupted.taskKey,
              runId: interrupted.runId,
              triggerSource: interrupted.triggerSource,
              executorId: interrupted.executorId,
            },
            'scheduled job interrupted during startup recovery',
          )
        }
        if (stopping) return
        accepting = true
        scheduler.start(initialized.recoveryCandidates)
      })()
      return startPromise
    },
    async runManual(input: { taskKey: ScheduledJobTaskKey; actor: ScheduledJobActorSnapshot }) {
      assertAccepting()
      return await trackManualClaim(
        (async () => {
          const result = await options.repository.claimManual({
            taskKey: input.taskKey,
            actor: input.actor,
            executorId,
            now: now(),
          })
          if (result.kind === 'running') {
            void runner
              .run({
                taskKey: input.taskKey,
                runId: result.runId,
                triggerSource: 'manual',
                onFinalized: scheduler.wake,
              })
              .catch((error: unknown) => {
                options.logger.error(
                  {
                    err: error,
                    taskKey: input.taskKey,
                    runId: result.runId,
                    triggerSource: 'manual',
                    executorId,
                  },
                  'scheduled job runner failed',
                )
              })
          } else if (result.kind === 'overlap') {
            options.logger.info(
              {
                taskKey: input.taskKey,
                runId: result.runId,
                triggerSource: 'manual',
                executorId,
                activeRunId: result.activeRunId,
              },
              'scheduled job skipped',
            )
          }
          return result
        })(),
      )
    },
    async requestCancellation(input: {
      taskKey: ScheduledJobTaskKey
      runId: string
      actor: ScheduledJobActorSnapshot
    }) {
      const result = await options.repository.requestCancellation({
        ...input,
        now: now(),
      })
      const logFields = {
        taskKey: input.taskKey,
        runId: input.runId,
        triggerSource: result.run.triggerSource,
        executorId: result.run.executorId,
      }
      options.logger.info(logFields, 'scheduled job cancellation requested')
      if (!runner.abort(input.runId)) {
        options.logger.error(logFields, 'scheduled job cancellation controller missing')
      }
      return result
    },
    wake() {
      scheduler.wake()
    },
    stop() {
      if (stopPromise) return stopPromise
      accepting = false
      stopping = true
      const schedulerDrain = scheduler.stop()
      stopPromise = (async () => {
        await schedulerDrain
        await startPromise?.catch(() => undefined)
        await Promise.all([...manualClaims])
        await runner.stop()
      })()
      return stopPromise
    },
  }
}

export function createProductionScheduledJobRuntime(options: ProductionScheduledJobRuntimeOptions) {
  const repository = createScheduledJobRepository(options.database)
  const registry = createProductionScheduledJobRegistry({
    database: options.database,
    storage: options.storage,
    retention: options.retention,
  })

  return createScheduledJobRuntime({
    ...options,
    registry,
    repository,
  })
}

export type ScheduledJobRuntime = ReturnType<typeof createScheduledJobRuntime>
