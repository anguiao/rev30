export const hanCharacterPattern = /\p{Script=Han}/u

const compactBoundaryPattern =
  /(?<=\p{Script=Han}) (?=[\p{Script=Han}a-z0-9])|(?<=[a-z0-9]) (?=\p{Script=Han})/gu

export function compactIconSearchKey(normalizedPhrase: string): string {
  return normalizedPhrase.replace(compactBoundaryPattern, '')
}
