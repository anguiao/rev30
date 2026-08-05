import type { Editor } from '@tiptap/core'
import { VueRenderer } from '@tiptap/vue-3'
import { defineRichTextEditorFeature } from '../../../editor/feature'
import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { richTextSlashCommand } from '../../../vue/slash-menu'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import {
  createImagePasteRule,
  getSelectedImageAttrs,
  insertImageAction,
  insertImageActionItem,
  type RichTextImageAttrs,
  updateImageAction,
} from '../editor'
import { imageFeature } from '../shared'
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

  function closeDialog() {
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
      onError: options.onError,
    },
  })
  editor.on('destroy', closeDialog)
}

export function createImageEditorFeature(options: RichTextImageUploadOptions) {
  return defineRichTextEditorFeature(imageFeature, {
    pasteRule: createImagePasteRule((editor, initialImageFile) =>
      openImageDialog(editor, options, initialImageFile),
    ),
  })
}

export function createImageToolbarControl(options: RichTextImageUploadOptions) {
  return richTextToolbarComponent({
    feature: imageFeature,
    component: ImageToolbarControl,
    props: {
      openDialog: (editor) => openImageDialog(editor, options),
    },
  })
}

export function createImageQuickBar(options: RichTextImageUploadOptions) {
  return richTextFeatureQuickBar({
    feature: imageFeature,
    isActive: (editor) => getSelectedImageAttrs(editor.state.selection) !== null,
    component: ImageQuickBar,
    props: {
      openDialog: (editor) => openImageDialog(editor, options),
    },
  })
}

export function createImageSlashCommand(options: RichTextImageUploadOptions) {
  return richTextSlashCommand(insertImageActionItem, (editor) => openImageDialog(editor, options))
}
