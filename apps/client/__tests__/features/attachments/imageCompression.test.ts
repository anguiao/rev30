import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compressImageFile } from '../../../src/features/attachments'

const drawImageMock = vi.fn()
const imageCloseMock = vi.fn()

let imageWidth = 4000
let imageHeight = 3000
let outputBlob: Blob | null = null
let outputType: string | undefined
let outputQuality: number | undefined
let canvasWidth: number | undefined
let canvasHeight: number | undefined

function createFile(size: number, name: string, type: string) {
  return new File(['x'.repeat(size)], name, {
    lastModified: 1_700_000_000_000,
    type,
  })
}

describe('compressImageFile', () => {
  beforeEach(() => {
    imageWidth = 4000
    imageHeight = 3000
    outputBlob = new Blob(['x'.repeat(50)], { type: 'image/webp' })
    outputType = undefined
    outputQuality = undefined
    canvasWidth = undefined
    canvasHeight = undefined
    drawImageMock.mockClear()
    imageCloseMock.mockClear()

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        close: imageCloseMock,
        height: imageHeight,
        width: imageWidth,
      })),
    )

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return {
        drawImage: drawImageMock,
      } as unknown as CanvasRenderingContext2D
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      function (this: HTMLCanvasElement, callback, type, quality) {
        outputType = type
        outputQuality = quality
        canvasWidth = this.width
        canvasHeight = this.height
        callback(outputBlob)
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resizes and re-encodes images when the result is meaningfully smaller', async () => {
    const file = createFile(100, 'cover.png', 'image/png')

    const result = await compressImageFile(file, {
      maxDimension: 1000,
      quality: 0.86,
    })

    expect(result).not.toBe(file)
    expect(result.name).toBe('cover.webp')
    expect(result.type).toBe('image/webp')
    expect(result.size).toBe(50)
    expect(result.lastModified).toBe(file.lastModified)
    expect(canvasWidth).toBe(1000)
    expect(canvasHeight).toBe(750)
    expect(outputType).toBe('image/webp')
    expect(outputQuality).toBe(0.86)
    expect(drawImageMock).toHaveBeenCalledWith(expect.any(Object), 0, 0, 1000, 750)
    expect(imageCloseMock).toHaveBeenCalledOnce()
  })

  it('keeps the original file when compression does not save enough size', async () => {
    outputBlob = new Blob(['x'.repeat(95)], { type: 'image/webp' })
    const file = createFile(100, 'cover.png', 'image/png')

    await expect(
      compressImageFile(file, {
        maxDimension: 1000,
        quality: 0.86,
      }),
    ).resolves.toBe(file)
  })

  it('skips non-compressible image types', async () => {
    const file = createFile(100, 'banner.gif', 'image/gif')

    await expect(
      compressImageFile(file, {
        maxDimension: 1000,
        quality: 0.86,
      }),
    ).resolves.toBe(file)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('skips WebP files because they are already compressed', async () => {
    const file = createFile(100, 'avatar.webp', 'image/webp')

    await expect(
      compressImageFile(file, {
        maxDimension: 512,
        quality: 0.82,
      }),
    ).resolves.toBe(file)
    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(drawImageMock).not.toHaveBeenCalled()
  })

  it('keeps the original file when the browser cannot produce the requested type', async () => {
    outputBlob = new Blob(['x'.repeat(50)], { type: 'image/png' })
    const file = createFile(100, 'cover.png', 'image/png')

    await expect(
      compressImageFile(file, {
        maxDimension: 1000,
        quality: 0.86,
      }),
    ).resolves.toBe(file)
  })
})
