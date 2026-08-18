export class OnlineSessionNotFoundError extends Error {
  constructor() {
    super('在线会话不存在')
    this.name = 'OnlineSessionNotFoundError'
  }
}

export class CurrentOnlineSessionConflictError extends Error {
  constructor() {
    super('不能强制下线当前会话')
    this.name = 'CurrentOnlineSessionConflictError'
  }
}
