import { defineRichTextPreset } from '../../src/core/preset'
import { baseEditorFeature } from '../../src/features/base/client/editor'
import { baseFeature } from '../../src/features/base/core/feature'
import { historyEditorFeature } from '../../src/features/history/client/editor'
import { historyFeature } from '../../src/features/history/core/feature'
import { imageEditorFeature } from '../../src/features/image/client/editor'
import { imageFeature } from '../../src/features/image/core/feature'
import {
  createImagePickerHandler,
  type RichTextImageUploadOptions,
} from '../../src/features/image/client/vue'
import { defineRichTextEditorPreset } from '../../src/client/vue/preset'

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
