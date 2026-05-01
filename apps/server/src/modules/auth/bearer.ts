export function parseBearerToken(authorization: string | undefined) {
  const parts = authorization?.split(' ') ?? []

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return undefined
  }

  return parts[1]
}
