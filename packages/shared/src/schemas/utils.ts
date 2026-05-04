export function isBlankString(value: unknown) {
  return typeof value === 'string' && value.trim() === ''
}

export function blankStringToUndefined(value: unknown) {
  return isBlankString(value) ? undefined : value
}

export function blankStringToNull(value: unknown) {
  return isBlankString(value) ? null : value
}
