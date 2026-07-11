import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES } from '@rev30/contracts'
import { compressImageFile } from '../../../src/features/attachments'
import { createRichTextDemoImageDataUrl } from '../../../src/features/demos'

vi.mock('../../../src/features/attachments', () => ({
  compressImageFile: vi.fn(),
}))

const compressImageFileMock = vi.mocked(compressImageFile)

describe('rich text demo images', () => {
  beforeEach(() => {
    compressImageFileMock.mockReset()
  })

  it('compresses supported images and returns a data URL', async () => {
    const source = new File(['source'], 'source.png', { type: 'image/png' })
    const compressed = new File(['webp'], 'source.webp', { type: 'image/webp' })
    compressImageFileMock.mockResolvedValue(compressed)

    await expect(createRichTextDemoImageDataUrl(source)).resolves.toMatch(
      /^data:image\/webp;base64,/,
    )
    expect(compressImageFileMock).toHaveBeenCalledWith(source, {
      maxDimension: 1600,
      quality: 0.82,
    })
  })

  it('rejects unsupported or oversized compressed images', async () => {
    const svg = new File(['<svg />'], 'source.svg', { type: 'image/svg+xml' })

    await expect(createRichTextDemoImageDataUrl(svg)).rejects.toThrow(
      '仅支持 PNG、JPEG 和 WebP 图片',
    )

    const source = new File(['source'], 'source.png', { type: 'image/png' })
    const oversized = new File(
      [new Uint8Array(RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES + 1)],
      'source.webp',
      { type: 'image/webp' },
    )
    compressImageFileMock.mockResolvedValue(oversized)

    await expect(createRichTextDemoImageDataUrl(source)).rejects.toThrow(
      '压缩后的图片不能超过 1 MB',
    )
  })
})
