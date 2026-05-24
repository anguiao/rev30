import type { ServerType } from '@hono/node-server'
import { logger } from './logger'

type ShutdownOptions = {
  server: ServerType
  cleanup: () => Promise<void>
}

async function closeServer(server: ServerType) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

export function registerShutdownHandlers({ server, cleanup }: ShutdownOptions) {
  let shutdownPromise: Promise<void> | null = null

  async function shutdown(signal: NodeJS.Signals) {
    if (shutdownPromise) {
      logger.info({ signal }, 'server shutdown already in progress')
      return shutdownPromise
    }

    shutdownPromise = (async () => {
      logger.info({ signal }, 'server shutting down')

      let shutdownError: unknown

      try {
        await closeServer(server)
      } catch (error) {
        shutdownError = error
      }

      try {
        await cleanup()
      } catch (error) {
        shutdownError ??= error
      }

      if (shutdownError) {
        logger.error({ error: shutdownError, signal }, 'server shutdown failed')
        process.exitCode = 1
        return
      }

      logger.info({ signal }, 'server stopped')
      process.exitCode = 0
    })()

    return shutdownPromise
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal)
    })
  }
}
