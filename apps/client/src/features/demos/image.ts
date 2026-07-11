import { RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES } from '@rev30/contracts'
import { compressImageFile } from '../attachments'

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxInputSizeBytes = 10 * 1024 * 1024

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('读取图片失败'))
    })
    reader.addEventListener('error', () => reject(new Error('读取图片失败')))
    reader.readAsDataURL(file)
  })
}

export async function createRichTextDemoImageDataUrl(file: File) {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error('仅支持 PNG、JPEG 和 WebP 图片')
  }

  if (file.size > maxInputSizeBytes) {
    throw new Error('图片不能超过 10 MB')
  }

  const compressedFile = await compressImageFile(file, {
    maxDimension: 1600,
    quality: 0.82,
  })

  if (compressedFile.size > RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES) {
    throw new Error('压缩后的图片不能超过 1 MB')
  }

  return await readFileAsDataUrl(compressedFile)
}
