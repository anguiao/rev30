import { DrizzleQueryError } from 'drizzle-orm/errors'
import { FormFieldError } from '../../../common/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const dictionaryCodeUniqueConstraintName = 'system_dictionary_types_code_active_unique'
const dictionaryItemValueUniqueConstraintName = 'system_dictionary_items_type_value_active_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class DictionaryCodeConflictError extends FormFieldError<'code'> {
  constructor() {
    super('字典编码已存在', 'code')
  }
}

export class DictionaryItemValueConflictError extends FormFieldError<'items'> {
  constructor() {
    super('字典项值已存在', 'items')
  }
}

export class DictionaryNotFoundError extends Error {
  constructor() {
    super('数据字典不存在')
    this.name = 'DictionaryNotFoundError'
  }
}

export class DictionaryInvalidItemError extends Error {
  constructor() {
    super('字典项无效')
    this.name = 'DictionaryInvalidItemError'
  }
}

export function toDictionaryConflictError(error: unknown) {
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

  if (constraintName === dictionaryCodeUniqueConstraintName) {
    return new DictionaryCodeConflictError()
  }

  if (constraintName === dictionaryItemValueUniqueConstraintName) {
    return new DictionaryItemValueConflictError()
  }

  return undefined
}
