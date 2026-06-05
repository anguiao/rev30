export function normalizeImageDimension(value: unknown) {
  const numberValue = Number(value)

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

export function normalizeImageSize(attributes: Record<string, unknown>) {
  const width = normalizeImageDimension(attributes.width)
  const height = normalizeImageDimension(attributes.height)

  return {
    width,
    height: width === null ? null : height,
  }
}

export function buildImageStyle(width: number | null) {
  return width === null
    ? 'max-width: 100%; height: auto'
    : `width: ${width}px; max-width: 100%; height: auto`
}
