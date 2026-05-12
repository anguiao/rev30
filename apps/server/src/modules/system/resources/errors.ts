import { DrizzleQueryError } from 'drizzle-orm/errors'
import { FormFieldError } from '../../../common/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const resourceUniqueConstraintName = 'system_resources_code_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class ResourceConflictError extends Error {
  constructor() {
    super('权限编码已存在')
    this.name = 'ResourceConflictError'
  }
}

export class ResourceNotFoundError extends Error {
  constructor() {
    super('权限资源不存在')
    this.name = 'ResourceNotFoundError'
  }
}

export class ResourceInvalidParentError extends Error {
  constructor() {
    super('上级权限资源不存在')
    this.name = 'ResourceInvalidParentError'
  }
}

export class ResourceMoveConflictError extends Error {
  constructor() {
    super('不能移动到自己或子级权限资源下')
    this.name = 'ResourceMoveConflictError'
  }
}

export class ResourceDeleteConflictError extends Error {
  constructor() {
    super('权限资源存在子级权限资源，不能删除')
    this.name = 'ResourceDeleteConflictError'
  }
}

export class ResourceRoleAuthorizationConflictError extends Error {
  constructor() {
    super('权限资源存在角色授权，不能删除')
    this.name = 'ResourceRoleAuthorizationConflictError'
  }
}

export class ResourceInvalidTypeFieldsError extends FormFieldError<'path' | 'externalUrl'> {
  constructor(message: string, field: 'path' | 'externalUrl') {
    super(message, field)
  }
}

export function toResourceConflictError(error: unknown) {
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

  return constraintName === resourceUniqueConstraintName ? new ResourceConflictError() : undefined
}
