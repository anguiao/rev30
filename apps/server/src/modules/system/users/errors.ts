import type { UserUniqueField } from '@rev30/contracts'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { FormFieldError } from '../../../core/errors'
import {
  POSTGRES_FOREIGN_KEY_VIOLATION_CODE,
  POSTGRES_UNIQUE_VIOLATION_CODE,
} from '../../../db/errors'

const userUniqueConstraintFields: Partial<Record<string, UserUniqueField>> = {
  system_users_email_unique: 'email',
  system_users_phone_unique: 'phone',
  system_users_username_unique: 'username',
} satisfies {
  [K in UserUniqueField as `system_users_${K}_unique`]: K
}

const userUniqueFieldConflictMessages: Record<UserUniqueField, string> = {
  email: '邮箱已存在',
  phone: '手机号已存在',
  username: '用户名已存在',
}
const userAvatarForeignKeyConstraintName = 'system_users_avatar_id_attachments_id_fk'

type DatabaseErrorCause = {
  code?: unknown
  constraint?: unknown
  constraint_name?: unknown
}

export class UserConflictError extends FormFieldError<UserUniqueField> {
  constructor(field: UserUniqueField) {
    super(userUniqueFieldConflictMessages[field], field)
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('用户不存在')
    this.name = 'UserNotFoundError'
  }
}

export class UserInvalidDepartmentError extends FormFieldError<'departmentIds'> {
  constructor() {
    super('部门不存在', 'departmentIds')
  }
}

export class UserInvalidRoleError extends FormFieldError<'roleIds'> {
  constructor() {
    super('角色不存在', 'roleIds')
  }
}

export class UserInvalidAvatarError extends Error {
  constructor() {
    super('头像无效')
    this.name = 'UserInvalidAvatarError'
  }
}

export class BuiltInUserMutationError extends Error {
  constructor(action: 'edit' | 'delete') {
    super(action === 'edit' ? '内置用户不能编辑' : '内置用户不能删除')
    this.name = 'BuiltInUserMutationError'
  }
}

function getDatabaseError(error: unknown) {
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

  if (typeof databaseError.code !== 'string' || !constraintName) {
    return undefined
  }

  return {
    code: databaseError.code,
    constraintName,
  }
}

export function toUserConflictError(error: unknown) {
  const databaseError = getDatabaseError(error)

  if (databaseError?.code !== POSTGRES_UNIQUE_VIOLATION_CODE) {
    return undefined
  }

  const field = userUniqueConstraintFields[databaseError.constraintName]

  return field ? new UserConflictError(field) : undefined
}

export function toUserInvalidAvatarError(error: unknown) {
  const databaseError = getDatabaseError(error)

  if (
    databaseError?.code !== POSTGRES_FOREIGN_KEY_VIOLATION_CODE ||
    databaseError.constraintName !== userAvatarForeignKeyConstraintName
  ) {
    return undefined
  }

  return new UserInvalidAvatarError()
}
