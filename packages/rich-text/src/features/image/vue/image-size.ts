export interface ImageNaturalSize {
  width: number
  height: number
}

export function loadImageNaturalSize(src: string): Promise<ImageNaturalSize> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => reject(new Error('Image load failed'))
    image.src = src
  })
}
