import type { Editor } from '@tiptap/core'
import { VueRenderer } from '@tiptap/vue-3'
import { richTextFeatureQuickBar } from '../../../../client/vue/quick-bar'
import { richTextToolbarComponent } from '../../../../client/vue/toolbar'
import {
  defineImagePickerHandler,
  getSelectedImageAttrs,
  insertImagesAction,
  type RichTextImageAttrs,
  updateImageAction,
} from '../editor'
import { imageFeature } from '../../core/feature'
import ImageDialog from './ImageDialog.vue'
import ImageQuickBar from './ImageQuickBar.vue'
import ImageToolbarControl from './ImageToolbarControl.vue'
import type { ListRichTextLibraryImages } from './useImageLibrary'

export type { RichTextImageLibraryQuery, RichTextImageLibraryResult } from './useImageLibrary'

export interface RichTextImageUploadOptions {
  readonly upload: (file: File) => Promise<{ src: string }>
  readonly listLibraryImages?: ListRichTextLibraryImages
  readonly onError?: (error: unknown) => void
}

function openImageDialog(
  editor: Editor,
  options: RichTextImageUploadOptions,
  initialImageFiles?: File[],
) {
  const selection = editor.state.selection
  const image = getSelectedImageAttrs(editor.state.selection)
  let renderer: VueRenderer
  let reportError = options.onError
  let active = true

  function closeDialog() {
    if (!active) return
    active = false
    reportError = undefined
    editor.off('destroy', closeDialog)
    renderer.destroy()
  }

  function cancelDialog() {
    closeDialog()
    if (!editor.isDestroyed) editor.commands.focus()
  }

  function confirmDialog(attrs: RichTextImageAttrs | RichTextImageAttrs[]) {
    if (!active || editor.isDestroyed) return
    editor.commands.command((props) => {
      props.tr.setSelection(selection)
      return Array.isArray(attrs)
        ? insertImagesAction.command(props, attrs)
        : updateImageAction.command(props, attrs)
    })
    closeDialog()
  }

  renderer = new VueRenderer(ImageDialog, {
    editor,
    props: {
      upload: options.upload,
      listLibraryImages: options.listLibraryImages,
      existingImage: image ?? undefined,
      initialImageFiles,
      onCancel: cancelDialog,
      onConfirm: confirmDialog,
      onError: (error: unknown) => reportError?.(error),
    },
  })
  editor.on('destroy', closeDialog)
}

export function createImagePickerHandler(options: RichTextImageUploadOptions) {
  return defineImagePickerHandler((editor, initialImageFiles) =>
    openImageDialog(editor, options, initialImageFiles),
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
