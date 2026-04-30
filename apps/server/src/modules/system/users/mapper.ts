import type { User } from '@rev30/shared'
import { users } from '../../../db/schema'

export type UserRow = typeof users.$inferSelect

export function toUser(user: UserRow): User {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    status: user.status as User['status'],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}
