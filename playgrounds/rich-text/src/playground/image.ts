const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const MAX_IMAGE_BYTES = 1 * 1024 * 1024

const imageDataUrlPattern = /^data:image\/(jpeg|png|webp);base64,(?<payload>[A-Za-z0-9+/]*={0,2})$/
const imageDataUrlGlobalPattern = /data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})/g

function getBase64ByteLength(payload: string) {
  if (!payload || payload.length % 4 !== 0) {
    return null
  }

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return (payload.length / 4) * 3 - padding
}

export function isAllowedImageDataUrl(src: string) {
  const payload = imageDataUrlPattern.exec(src)?.groups?.payload
  const byteLength = payload === undefined ? null : getBase64ByteLength(payload)

  return byteLength !== null && byteLength <= MAX_IMAGE_BYTES
}

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

export async function readImageFileAsDataUrl(file: File) {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error('仅支持 JPEG、PNG 和 WebP 图片')
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('图片不能超过 1 MiB')
  }

  const src = await readFileAsDataUrl(file)

  if (!isAllowedImageDataUrl(src)) {
    throw new Error('读取图片失败')
  }

  return src
}

export function redactImageDataUrls(value: string) {
  return value.replace(imageDataUrlGlobalPattern, (match, mime: string, payload: string) => {
    const byteLength = getBase64ByteLength(payload)

    return byteLength === null
      ? match
      : `data:image/${mime};base64,[图片 payload 已省略，${byteLength} 字节]`
  })
}
