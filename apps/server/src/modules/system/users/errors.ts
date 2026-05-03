import type { UserUniqueField } from '@rev30/shared'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { POSTGRES_UNIQUE_VIOLATION_CODE } from '../../../db/errors'

const userUniqueConstraintFields: Partial<Record<string, UserUniqueField>> = {
  users_email_unique: 'email',
  users_phone_unique: 'phone',
  users_username_unique: 'username',
} satisfies {
  [K in UserUniqueField as `users_${K}_unique`]: K
}

const userUniqueFieldConflictMessages: Record<UserUniqueField, string> = {
  email: '邮箱已存在',
  phone: '手机号已存在',
  username: '用户名已存在',
}

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class UserConflictError extends Error {
  constructor(public readonly field: UserUniqueField) {
    super(userUniqueFieldConflictMessages[field])
    this.name = 'UserConflictError'
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('用户不存在')
    this.name = 'UserNotFoundError'
  }
}

export class UserInvalidDepartmentError extends Error {
  constructor() {
    super('部门不存在')
    this.name = 'UserInvalidDepartmentError'
  }
}

export function toUserConflictError(error: unknown) {
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

  const field = userUniqueConstraintFields[constraintName]

  return field ? new UserConflictError(field) : undefined
}
