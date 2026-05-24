import { DrizzleQueryError } from 'drizzle-orm/errors'
import { FormFieldError } from '../../../core/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const configKeyUniqueConstraintName = 'system_configs_key_active_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class ConfigConflictError extends FormFieldError<'key'> {
  constructor() {
    super('配置键已存在', 'key')
  }
}

export class ConfigInvalidValueError extends FormFieldError<'value'> {
  constructor(message: string) {
    super(message, 'value')
  }
}

export class ConfigNotFoundError extends Error {
  constructor() {
    super('配置不存在')
    this.name = 'ConfigNotFoundError'
  }
}

export function toConfigConflictError(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error

  if (!cause || typeof cause !== 'object') {
    return undefined
  }

  const databaseError = cause as DatabaseErrorCause
  const constraintName =
    typeof databaseError.constraint === 'string'
      ? databaseError.constraint
      : typeof databaseError.constraint_name === 'string'
        ? databaseError.constraint_name
        : undefined

  if (databaseError.code !== POSTGRES_UNIQUE_VIOLATION_CODE || !constraintName) {
    return undefined
  }

  return constraintName === configKeyUniqueConstraintName ? new ConfigConflictError() : undefined
}
