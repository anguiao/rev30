import { DrizzleQueryError } from 'drizzle-orm/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../../db/errors'

const customIconSetPrefixUniqueConstraintName = 'custom_icon_sets_prefix_active_unique'
const customIconNameUniqueConstraintName = 'custom_icon_set_icons_set_name_active_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class CustomIconSetNotFoundError extends Error {
  constructor() {
    super('自定义图标集不存在')
    this.name = 'CustomIconSetNotFoundError'
  }
}

export class CustomIconSetConflictError extends Error {
  constructor(message = '图标集前缀已存在') {
    super(message)
    this.name = 'CustomIconSetConflictError'
  }
}

export class CustomIconNotFoundError extends Error {
  constructor() {
    super('图标不存在')
    this.name = 'CustomIconNotFoundError'
  }
}

export class CustomIconConflictError extends Error {
  constructor(message = '图标名称已存在') {
    super(message)
    this.name = 'CustomIconConflictError'
  }
}

export class CustomSvgInvalidError extends Error {
  constructor(message = 'SVG 无效') {
    super(message)
    this.name = 'CustomSvgInvalidError'
  }
}

export function toCustomIconConflictError(error: unknown) {
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

  if (constraintName === customIconSetPrefixUniqueConstraintName) {
    return new CustomIconSetConflictError()
  }

  if (constraintName === customIconNameUniqueConstraintName) {
    return new CustomIconConflictError()
  }

  return undefined
}
