import type { DepartmentSummary, RoleSummary, User, UserOption } from '@rev30/shared'
import { systemUsers } from '../../../db/schema'

export type UserRow = typeof systemUsers.$inferSelect
export type UserOptionRow = Pick<UserRow, keyof UserOption>

export function toUser(
  user: UserRow,
  departments: DepartmentSummary[] = [],
  roles: RoleSummary[] = [],
): User {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    status: user.status as User['status'],
    builtIn: user.builtIn,
    departments,
    roles,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

export function toUserOption(user: UserOptionRow): UserOption {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    status: user.status as UserOption['status'],
  }
}
