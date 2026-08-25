const requiredAccessCodeByRoutePath: ReadonlyMap<string, string> = new Map([
  ['/ops/scheduled-jobs', 'ops:scheduled-job:list'],
] as const)

export function hasRequiredRouteAccess(path: string, accessCodes: readonly string[]) {
  const requiredAccessCode = requiredAccessCodeByRoutePath.get(path)

  return requiredAccessCode === undefined || accessCodes.includes(requiredAccessCode)
}
