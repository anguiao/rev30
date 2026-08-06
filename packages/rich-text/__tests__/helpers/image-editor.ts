import { defineRichTextPreset } from '../../src/core/preset'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { historyEditorFeature } from '../../src/features/history/editor'
import { historyFeature } from '../../src/features/history/shared'
import { imageEditorFeature } from '../../src/features/image/editor'
import { imageFeature } from '../../src/features/image/shared'
import {
  createImagePickerHandler,
  type RichTextImageUploadOptions,
} from '../../src/features/image/vue'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'

const imageTestPreset = defineRichTextPreset({
  key: 'image-test',
  features: [baseFeature, historyFeature, imageFeature],
})

export function createImageTestEditorPreset(options: RichTextImageUploadOptions) {
  return defineRichTextEditorPreset(imageTestPreset, {
    editorFeatures: [baseEditorFeature, historyEditorFeature, imageEditorFeature],
    interactionHandlers: [createImagePickerHandler(options)],
  })
}
