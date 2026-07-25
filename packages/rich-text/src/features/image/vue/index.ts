import type { Editor } from '@tiptap/core'
import { VueRenderer } from '@tiptap/vue-3'
import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { richTextSlashCommand } from '../../../vue/slash-menu'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import {
  canInsertImage,
  getSelectedImageAttrs,
  insertImageAction,
  insertImageActionItem,
  updateImageAction,
} from '../editor'
import { imageFeature, type RichTextImageInput } from '../shared'
import ImageDialog from './ImageDialog.vue'
import ImageQuickBar from './ImageQuickBar.vue'
import ImageToolbarControl from './ImageToolbarControl.vue'

export interface RichTextImageUploadOptions {
  readonly upload: (file: File) => Promise<{ src: string }>
  readonly onError?: (error: unknown) => void
}

function openImageDialog(editor: Editor, options: RichTextImageUploadOptions) {
  const image = getSelectedImageAttrs(editor)

  if (image === null && !canInsertImage(editor)) {
    return false
  }

  const action = image === null ? insertImageAction : updateImageAction
  let renderer: VueRenderer

  function closeDialog() {
    editor.off('destroy', closeDialog)
    renderer.destroy()
  }

  function cancelDialog() {
    closeDialog()
    editor.commands.focus()
  }

  function confirmDialog(attrs: RichTextImageInput) {
    if (editor.commands.command(action.command(attrs))) {
      closeDialog()
    }
  }

  renderer = new VueRenderer(ImageDialog, {
    editor,
    props: {
      upload: options.upload,
      image: image ?? undefined,
      onCancel: cancelDialog,
      onConfirm: confirmDialog,
      onError: options.onError,
    },
  })
  editor.on('destroy', closeDialog)

  return true
}

export function createImageToolbarControl(options: RichTextImageUploadOptions) {
  return richTextToolbarComponent({
    feature: imageFeature,
    key: 'image',
    component: ImageToolbarControl,
    props: {
      openDialog: (editor) => openImageDialog(editor, options),
    },
  })
}

export function createImageQuickBar(options: RichTextImageUploadOptions) {
  return richTextFeatureQuickBar({
    feature: imageFeature,
    isActive: (editor) => getSelectedImageAttrs(editor) !== null,
    component: ImageQuickBar,
    props: {
      openDialog: (editor) => openImageDialog(editor, options),
    },
  })
}

export function createImageSlashCommand(options: RichTextImageUploadOptions) {
  return richTextSlashCommand(insertImageActionItem, (editor) => openImageDialog(editor, options))
}
