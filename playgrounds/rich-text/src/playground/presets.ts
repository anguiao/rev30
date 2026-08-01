import { createAllRichTextServerPreset } from '@rev30/rich-text/server/presets/all'
import type { RichTextServerPreset } from '@rev30/rich-text/server'
import { createAllRichTextEditorPreset } from '@rev30/rich-text/vue/presets/all'
import type { RichTextEditorPreset } from '@rev30/rich-text/vue'
import { isAllowedImageDataUrl, readImageFileAsDataUrl } from './image'

export interface PlaygroundPresetCallbacks {
  readonly onImageError: (error: unknown) => void
  readonly onImageSuccess?: () => void
}

export function createPlaygroundPresets(callbacks: PlaygroundPresetCallbacks): {
  editorPreset: RichTextEditorPreset
  serverPreset: RichTextServerPreset
} {
  const editorPreset = createAllRichTextEditorPreset({
    image: {
      async upload(file) {
        const src = await readImageFileAsDataUrl(file)
        callbacks.onImageSuccess?.()
        return { src }
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
