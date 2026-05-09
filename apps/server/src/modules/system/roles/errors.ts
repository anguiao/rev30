import { DrizzleQueryError } from 'drizzle-orm/errors'
import { FormFieldError } from '../../../common/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const roleUniqueConstraintName = 'roles_code_unique'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class RoleConflictError extends FormFieldError<'code'> {
  constructor() {
    super('角色编码已存在', 'code')
  }
}

export class RoleNotFoundError extends Error {
  constructor() {
    super('角色不存在')
    this.name = 'RoleNotFoundError'
  }
}

export class RoleInvalidResourceError extends Error {
  constructor() {
    super('资源不存在')
    this.name = 'RoleInvalidResourceError'
  }
}

export class RoleInvalidResourceAssignmentError extends FormFieldError<'resourceIds'> {
  constructor(message: string) {
    super(message, 'resourceIds')
  }
}

export class RoleDeleteConflictError extends Error {
  constructor() {
    super('角色存在关联用户，不能删除')
    this.name = 'RoleDeleteConflictError'
  }
}

export class BuiltInAdminRoleMutationError extends Error {
  constructor(action: 'edit' | 'delete') {
    super(action === 'edit' ? '内置 admin 角色不能编辑' : '内置 admin 角色不能删除')
    this.name = 'BuiltInAdminRoleMutationError'
  }
}

export function toRoleConflictError(error: unknown) {
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

  return constraintName === roleUniqueConstraintName ? new RoleConflictError() : undefined
}
