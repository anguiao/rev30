import { richTextFeatureQuickbar } from '../../vue/quickbar'
import { richTextToolbarComponent } from '../../vue/toolbar'
import { imageFeature } from './shared'
import { resolveRichTextImageQuickbarTarget } from './vue/dialog-controller'
import ImageQuickbar from './vue/ImageQuickbar.vue'
import ImageToolbarControl from './vue/ImageToolbarControl.vue'

export interface RichTextImageUploadOptions {
  upload: (file: File) => Promise<{ src: string }>
  onError?: (error: unknown) => void
}

export function createImageToolbarControl(options: RichTextImageUploadOptions) {
  return richTextToolbarComponent({
    feature: imageFeature,
    key: 'image',
    component: ImageToolbarControl,
    props: options,
  })
}

export function createImageQuickbar(options: RichTextImageUploadOptions) {
  return richTextFeatureQuickbar({
    feature: imageFeature,
    key: imageFeature.key,
    isActive: (editor) => resolveRichTextImageQuickbarTarget(editor) !== null,
    component: ImageQuickbar,
    props: options,
  })
}
