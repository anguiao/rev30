import { describe, expect, it } from 'vitest'
import { createLoggerOptions } from '../src/logger'

describe('logger options', () => {
  it('uses pino-pretty outside production and test by default', () => {
    expect(createLoggerOptions({ nodeEnv: 'development' })).toMatchObject({
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      },
    })
  })

  it('keeps production logs as JSON by default', () => {
    expect(createLoggerOptions({ nodeEnv: 'production' })).not.toHaveProperty('transport')
  })

  it('allows pretty output to be disabled explicitly', () => {
    expect(createLoggerOptions({ logPretty: 'false', nodeEnv: 'development' })).not.toHaveProperty(
      'transport',
    )
  })
})
