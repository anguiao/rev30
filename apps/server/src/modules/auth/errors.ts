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

export class AuthInvalidAccessTokenError extends Error {
  constructor() {
    super('访问令牌无效')
    this.name = 'AuthInvalidAccessTokenError'
  }
}

export class AuthAccessTokenExpiredError extends Error {
  constructor() {
    super('访问令牌已过期')
    this.name = 'AuthAccessTokenExpiredError'
  }
}

export class AuthUnauthorizedError extends Error {
  constructor() {
    super('未授权')
    this.name = 'AuthUnauthorizedError'
  }
}
