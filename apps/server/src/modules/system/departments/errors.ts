import { DrizzleQueryError } from 'drizzle-orm/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const departmentUniqueConstraintName = 'departments_code_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class DepartmentConflictError extends Error {
  constructor() {
    super('部门编码已存在')
    this.name = 'DepartmentConflictError'
  }
}

export class DepartmentNotFoundError extends Error {
  constructor() {
    super('部门不存在')
    this.name = 'DepartmentNotFoundError'
  }
}

export class DepartmentInvalidParentError extends Error {
  constructor() {
    super('父部门不存在')
    this.name = 'DepartmentInvalidParentError'
  }
}

export class DepartmentMoveConflictError extends Error {
  constructor() {
    super('不能移动到自己或子部门下')
    this.name = 'DepartmentMoveConflictError'
  }
}

export class DepartmentDeleteConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DepartmentDeleteConflictError'
  }
}

export function toDepartmentConflictError(error: unknown) {
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

  return constraintName === departmentUniqueConstraintName
    ? new DepartmentConflictError()
    : undefined
}
