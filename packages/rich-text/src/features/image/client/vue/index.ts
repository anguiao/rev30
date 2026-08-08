import type { Editor } from '@tiptap/core'
import { VueRenderer } from '@tiptap/vue-3'
import { richTextFeatureQuickBar } from '../../../../client/vue/quick-bar'
import { richTextToolbarComponent } from '../../../../client/vue/toolbar'
import {
  defineImagePickerHandler,
  getSelectedImageAttrs,
  insertImageAction,
  type RichTextImageAttrs,
  updateImageAction,
} from '../editor'
import { imageFeature } from '../../core/feature'
import ImageDialog from './ImageDialog.vue'
import ImageQuickBar from './ImageQuickBar.vue'
import ImageToolbarControl from './ImageToolbarControl.vue'

export interface RichTextImageUploadOptions {
  readonly upload: (file: File) => Promise<{ src: string }>
  readonly onError?: (error: unknown) => void
}

function openImageDialog(
  editor: Editor,
  options: RichTextImageUploadOptions,
  initialImageFile?: File,
) {
  const selection = editor.state.selection
  const image = getSelectedImageAttrs(editor.state.selection)
  const action = image === null ? insertImageAction : updateImageAction
  let renderer: VueRenderer
  let reportError = options.onError

  function closeDialog() {
    reportError = undefined
    editor.off('destroy', closeDialog)
    renderer.destroy()
  }

  function cancelDialog() {
    closeDialog()
    editor.commands.focus()
  }

  function confirmDialog(attrs: RichTextImageAttrs) {
    editor.commands.command((props) => {
      props.tr.setSelection(selection)
      return action.command(props, attrs)
    })
    closeDialog()
  }

  renderer = new VueRenderer(ImageDialog, {
    editor,
    props: {
      upload: options.upload,
      existingImage: image ?? undefined,
      initialImageFile,
      onCancel: cancelDialog,
      onConfirm: confirmDialog,
      onError: (error: unknown) => reportError?.(error),
    },
  })
  editor.on('destroy', closeDialog)
}

export function createImagePickerHandler(options: RichTextImageUploadOptions) {
  return defineImagePickerHandler((editor, initialImageFile) =>
    openImageDialog(editor, options, initialImageFile),
  )
}

export const imageToolbarControl = richTextToolbarComponent({
  feature: imageFeature,
  component: ImageToolbarControl,
  props: {},
})

export const imageQuickBar = richTextFeatureQuickBar({
  feature: imageFeature,
  isActive: (editor) => getSelectedImageAttrs(editor.state.selection) !== null,
  component: ImageQuickBar,
  props: {},
})
