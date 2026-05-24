import pino from 'pino'

function readLogLevel() {
  return process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info')
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
  })
}

export const logger = createLogger()
