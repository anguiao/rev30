import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { richTextSlashUiCommand } from '../../../vue/slash-command'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import { insertImageActionItem } from '../editor'
import { imageFeature } from '../shared'
import {
  getRichTextImageDialogController,
  resolveRichTextImageAnchorTarget,
  resolveRichTextImageQuickBarTarget,
} from './dialog-controller'
import ImageQuickBar from './ImageQuickBar.vue'
import ImageToolbarControl from './ImageToolbarControl.vue'

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

export function createImageQuickBar(options: RichTextImageUploadOptions) {
  return richTextFeatureQuickBar({
    feature: imageFeature,
    isActive: (editor) => resolveRichTextImageQuickBarTarget(editor) !== null,
    component: ImageQuickBar,
    props: options,
  })
}

export function createImageSlashCommand(options: RichTextImageUploadOptions) {
  return richTextSlashUiCommand(insertImageActionItem, {
    run: ({ editor, anchor }) => {
      const target = resolveRichTextImageAnchorTarget(editor, anchor)

      if (!target) {
        return false
      }

      getRichTextImageDialogController(editor).open(target, options)
      return true
    },
  })
}
