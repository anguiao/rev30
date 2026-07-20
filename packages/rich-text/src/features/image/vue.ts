import { richTextBlockMenuUiCommand } from '../../vue/block-menu'
import { richTextFeatureQuickbar } from '../../vue/quickbar'
import { richTextToolbarComponent } from '../../vue/toolbar'
import { imageFeature } from './shared'
import {
  getRichTextImageDialogController,
  resolveRichTextImageAnchorTarget,
  resolveRichTextImageQuickbarTarget,
} from './vue/dialog-controller'
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

export function createImageBlockMenuCommand(options: RichTextImageUploadOptions) {
  return richTextBlockMenuUiCommand({
    feature: imageFeature,
    key: imageFeature.key,
    label: '图片',
    icon: 'i-[lucide--image]',
    keywords: ['image', 'img', 'picture'],
    run: ({ editor, source, anchor }) => {
      const target = resolveRichTextImageAnchorTarget(editor, anchor)

      if (!target) {
        return false
      }

      getRichTextImageDialogController(editor).open(source, target, options)
      return true
    },
  })
}
