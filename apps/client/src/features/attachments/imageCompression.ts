export type ImageCompressionOptions = {
  maxDimension: number
  quality: number
}

const compressedImageExtension = 'webp'
const compressedImageType = 'image/webp'
const compressedImageMaxSizeRatio = 0.9

const compressibleImageTypes = new Set(['image/jpeg', 'image/png'])

function getTargetSize(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height))

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

function replaceFileExtension(name: string, extension: string) {
  const dotIndex = name.lastIndexOf('.')
  const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name

  return `${baseName || 'image'}.${extension}`
}

function createCanvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, compressedImageType, quality)
  })
}

export async function compressImageFile(file: File, options: ImageCompressionOptions) {
  if (!compressibleImageTypes.has(file.type)) {
    return file
  }

  try {
    const image = await createImageBitmap(file)
    try {
      const targetSize = getTargetSize(image.width, image.height, options.maxDimension)
      const shouldResize = targetSize.width !== image.width || targetSize.height !== image.height
      const shouldChangeType = file.type !== compressedImageType

      if (!shouldResize && !shouldChangeType) {
        return file
      }

      const canvas = document.createElement('canvas')
      canvas.width = targetSize.width
      canvas.height = targetSize.height

      const context = canvas.getContext('2d')
      if (!context) {
        return file
      }

      context.drawImage(image, 0, 0, targetSize.width, targetSize.height)

      const blob = await createCanvasBlob(canvas, options.quality)
      if (!blob || blob.type !== compressedImageType) {
        return file
      }

      const compressedFile = new File(
        [blob],
        replaceFileExtension(file.name, compressedImageExtension),
        {
          lastModified: file.lastModified,
          type: blob.type,
        },
      )

      if (compressedFile.size >= file.size * compressedImageMaxSizeRatio) {
        return file
      }

      return compressedFile
    } finally {
      image.close()
    }
  } catch {
    return file
  }
}
