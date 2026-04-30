export class AuthInvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password')
    this.name = 'AuthInvalidCredentialsError'
  }
}

export class AuthInvalidRefreshTokenError extends Error {
  constructor() {
    super('Invalid refresh token')
    this.name = 'AuthInvalidRefreshTokenError'
  }
}

export class AuthUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'AuthUnauthorizedError'
  }
}
