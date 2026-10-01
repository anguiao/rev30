import type { Command, Editor } from '@tiptap/core'
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
import ImageBatchInsertDialog from './insert/ImageBatchInsertDialog.vue'
import ImageEditDialog from './edit/ImageEditDialog.vue'
import ImageQuickBar from './ImageQuickBar.vue'
import ImageToolbarControl from './ImageToolbarControl.vue'
import type { ImageUpload } from './shared/draft'
import type { ListRichTextLibraryImages } from './shared/useImageLibrary'

export type {
  RichTextImageLibraryQuery,
  RichTextImageLibraryResult,
} from './shared/useImageLibrary'

export interface RichTextImageUploadOptions {
  readonly upload: ImageUpload
  readonly listLibraryImages?: ListRichTextLibraryImages
  readonly onError?: (error: unknown) => void
}

function openImageDialog(
  editor: Editor,
  options: RichTextImageUploadOptions,
  pastedFiles?: File[],
) {
  const selection = editor.state.selection
  const image = getSelectedImageAttrs(selection)
  let renderer: VueRenderer
  let active = true

  function closeDialog() {
    if (!active) {
      return
    }

    active = false
    editor.off('destroy', closeDialog)
    renderer.destroy()
  }

  function cancelDialog() {
    closeDialog()
    if (!editor.isDestroyed) {
      editor.commands.focus()
    }
  }

  function confirmDialog(command: Command) {
    if (!active || editor.isDestroyed) {
      return
    }

    editor.commands.command((props) => {
      props.tr.setSelection(selection)
      return command(props)
    })
    closeDialog()
  }

  const sharedProps = {
    upload: options.upload,
    listLibraryImages: options.listLibraryImages,
    pastedFiles,
    onCancel: cancelDialog,
    onError: (error: unknown) => {
      if (active) {
        options.onError?.(error)
      }
    },
  }

  if (image === null) {
    renderer = new VueRenderer(ImageBatchInsertDialog, {
      editor,
      props: {
        ...sharedProps,
        onConfirm: (images: RichTextImageAttrs[]) =>
          confirmDialog((props) => insertImagesAction.command(props, images)),
      },
    })
  } else {
    renderer = new VueRenderer(ImageEditDialog, {
      editor,
      props: {
        ...sharedProps,
        existingImage: image,
        onConfirm: (attrs: RichTextImageAttrs) =>
          confirmDialog((props) => updateImageAction.command(props, attrs)),
      },
    })
  }

  editor.on('destroy', closeDialog)
}

export function createImagePickerHandler(options: RichTextImageUploadOptions) {
  return defineImagePickerHandler((editor, pastedFiles) =>
    openImageDialog(editor, options, pastedFiles),
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
