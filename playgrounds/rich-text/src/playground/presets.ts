import { createAllRichTextServerPreset } from '@rev30/rich-text/server/presets/all'
import type { RichTextServerPreset } from '@rev30/rich-text/server'
import { createAllRichTextEditorPreset } from '@rev30/rich-text/vue/presets/all'
import type { RichTextEditorPreset } from '@rev30/rich-text/vue'
import { isAllowedImageDataUrl, readImageFileAsDataUrl } from './image'

function createLibraryImages() {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 24
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Canvas 2D is unavailable')

  return Array.from({ length: 21 }, (_, index) => {
    context.fillStyle = `hsl(${index * 37} 70% 55%)`
    context.fillRect(0, 0, canvas.width, canvas.height)

    return {
      src: canvas.toDataURL('image/png'),
      name: `Library Image ${String(index + 1).padStart(2, '0')}`,
    }
  })
}

export interface PlaygroundPresetCallbacks {
  readonly onImageError: (error: unknown) => void
  readonly onImageSuccess?: () => void
}

export function createPlaygroundPresets(callbacks: PlaygroundPresetCallbacks): {
  editorPreset: RichTextEditorPreset
  serverPreset: RichTextServerPreset
} {
  const libraryImages = createLibraryImages()
  const editorPreset = createAllRichTextEditorPreset({
    image: {
      async upload(file) {
        const src = await readImageFileAsDataUrl(file)
        callbacks.onImageSuccess?.()
        return { src }
      },
      async listLibraryImages({ keyword, page, pageSize }) {
        const search = keyword?.trim().toLowerCase() ?? ''
        const matches = libraryImages.filter((image) => image.name.toLowerCase().includes(search))

        return {
          list: matches.slice((page - 1) * pageSize, page * pageSize),
          total: matches.length,
          page,
          pageSize,
        }
      },
      onError: callbacks.onImageError,
    },
  })

  const serverPreset = createAllRichTextServerPreset({
    image: {
      allowedSrcSchemes: ['data'],
      isAllowedSrc: isAllowedImageDataUrl,
    },
  })

  return { editorPreset, serverPreset }
}
