export class AuthInvalidCredentialsError extends Error {
  constructor() {
    super('用户名或密码错误')
    this.name = 'AuthInvalidCredentialsError'
  }
}

export class AuthInvalidRefreshTokenError extends Error {
  constructor() {
    super('刷新令牌无效')
    this.name = 'AuthInvalidRefreshTokenError'
  }
}

export class AuthUnauthorizedError extends Error {
  constructor() {
    super('未授权')
    this.name = 'AuthUnauthorizedError'
  }
}
