type RequestQueryValue = string | number | undefined

export function normalizeRequestQuery<T extends Record<string, RequestQueryValue>>(query: T) {
  const requestQuery = {} as Partial<Record<keyof T, string>>

  for (const [key, value] of Object.entries(query) as [keyof T, T[keyof T]][]) {
    if (value !== undefined && value !== '') {
      requestQuery[key] = String(value)
    }
  }

  return requestQuery
}
