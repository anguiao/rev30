type RequestQueryValue = string | number | boolean | undefined

export function normalizeRequestQuery<T extends Record<string, RequestQueryValue>>(query: T) {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ) as Partial<Record<keyof T, string>>
}
