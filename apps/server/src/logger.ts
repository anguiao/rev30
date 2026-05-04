import pino from 'pino'

export type LogPayload = Record<string, unknown>

export interface AppLogger {
  debug: (payload: LogPayload, message: string) => void
  error: (payload: LogPayload, message: string) => void
  info: (payload: LogPayload, message: string) => void
  warn: (payload: LogPayload, message: string) => void
}

export type RequestLogger = Pick<AppLogger, 'error' | 'info'>

function readLogLevel() {
  return process.env.LOG_LEVEL ?? 'info'
}

export function createLogger() {
  return pino({
    name: 'rev30-server',
    level: readLogLevel(),
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: [
      'authorization',
      'cookie',
      'set-cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
    ],
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:standard',
      },
    },
  })
}

export const logger = createLogger()
