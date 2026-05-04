import type { DepartmentSummary, RoleSummary, User } from '@rev30/shared'
import { users } from '../../../db/schema'

export type UserRow = typeof users.$inferSelect

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
    departments,
    roles,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}
