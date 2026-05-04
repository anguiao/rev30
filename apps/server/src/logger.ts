import pino, { type LoggerOptions } from 'pino'

export type LogPayload = Record<string, unknown>

export interface AppLogger {
  debug: (payload: LogPayload, message: string) => void
  error: (payload: LogPayload, message: string) => void
  info: (payload: LogPayload, message: string) => void
  warn: (payload: LogPayload, message: string) => void
}

export type RequestLogger = Pick<AppLogger, 'error' | 'info'>

export type LoggerEnvironment = {
  logLevel?: string | undefined
  logPretty?: string | undefined
  nodeEnv?: string | undefined
}

function readLogLevel(environment: LoggerEnvironment) {
  return environment.logLevel ?? (environment.nodeEnv === 'test' ? 'silent' : 'info')
}

function shouldUsePretty(environment: LoggerEnvironment) {
  if (environment.logPretty) {
    return environment.logPretty === 'true'
  }

  return environment.nodeEnv !== 'production' && environment.nodeEnv !== 'test'
}

export function createLoggerOptions(
  environment: LoggerEnvironment = {
    logLevel: process.env.LOG_LEVEL,
    logPretty: process.env.LOG_PRETTY,
    nodeEnv: process.env.NODE_ENV,
  },
): LoggerOptions {
  const options: LoggerOptions = {
    name: 'rev30-server',
    level: readLogLevel(environment),
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: [
      'authorization',
      'cookie',
      'set-cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
    ],
  }

  if (shouldUsePretty(environment)) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:standard',
      },
    }
  }

  return options
}

export function createLogger(environment?: LoggerEnvironment) {
  return pino(createLoggerOptions(environment))
}

export const logger = createLogger()
