import type { ServerType } from '@hono/node-server'
import { logger } from './logger'

export async function closeServer(server: ServerType) {
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

export function registerShutdownHandlers(shutdown: () => Promise<void>) {
  let shutdownPromise: Promise<void> | null = null

  async function handleShutdown(signal: NodeJS.Signals) {
    if (shutdownPromise) {
      logger.info({ signal }, 'server shutdown already in progress')
      return shutdownPromise
    }

    shutdownPromise = (async () => {
      logger.info({ signal }, 'server shutting down')

      try {
        await shutdown()
      } catch (error) {
        logger.error({ err: error, signal }, 'server shutdown failed')
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
      void handleShutdown(signal)
    })
  }
}
