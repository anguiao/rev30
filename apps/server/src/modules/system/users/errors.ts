export type UniqueField = 'username' | 'email' | 'phone'

export class SystemUserConflictError extends Error {
  constructor(public readonly field: UniqueField) {
    super(`${field} already exists`)
    this.name = 'SystemUserConflictError'
  }
}

export class SystemUserNotFoundError extends Error {
  constructor() {
    super('User not found')
    this.name = 'SystemUserNotFoundError'
  }
}
