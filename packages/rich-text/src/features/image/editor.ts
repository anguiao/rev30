import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection, type Selection } from '@tiptap/pm/state'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { defineRichTextInteraction } from '../../editor/interaction'
import type { RichTextPasteRule } from '../../editor/paste'
import { imageFeature } from './shared'

export interface RichTextImageAttrs {
  src: string
  alt: string | null
  width: number | null
  height: number | null
}

export function getSelectedImageAttrs(selection: Selection): RichTextImageAttrs | null {
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
    return null
  }

  return {
    src: selection.node.attrs.src,
    alt: selection.node.attrs.alt,
    width: selection.node.attrs.width,
    height: selection.node.attrs.height,
  }
}

const proseMirrorSlicePattern = /^(\d+) (\d+)(?: -(\d+))? (.+)$/

function hasValidProseMirrorSlice(value: string | null) {
  if (value === null) {
    return false
  }

  const match = proseMirrorSlicePattern.exec(value)

  if (
    match === null ||
    match[4] === undefined ||
    !Number.isSafeInteger(Number(match[1])) ||
    !Number.isSafeInteger(Number(match[2])) ||
    (match[3] !== undefined && !Number.isSafeInteger(Number(match[3])))
  ) {
    return false
  }

  try {
    const context = JSON.parse(match[4])

    return Array.isArray(context) && context.length % 2 === 0
  } catch {
    return false
  }
}

export function isInternalRichTextHtml(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html

  return hasValidProseMirrorSlice(
    template.content.firstElementChild?.getAttribute('data-pm-slice') ?? null,
  )
}

export function transformPastedImageHtml(html: string) {
  if (isInternalRichTextHtml(html)) {
    return html
  }

  const template = document.createElement('template')
  template.innerHTML = html

  for (const image of template.content.querySelectorAll('img')) {
    image.remove()
  }

  return template.innerHTML
}

export function getFirstClipboardImageFile(files: FileList | null | undefined) {
  if (files === null || files === undefined) {
    return null
  }

  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index)

    if (file?.type.startsWith('image/')) {
      return file
    }
  }

  return null
}

const imagePicker = defineRichTextInteraction<typeof imageFeature, File | undefined>(
  imageFeature,
  'pick-image',
)

export function openImagePicker(editor: Editor, initialImageFile?: File) {
  imagePicker.request(editor, initialImageFile)
}

export function defineImagePickerHandler(
  handle: (editor: Editor, initialImageFile?: File) => void,
) {
  return imagePicker.defineHandler(handle)
}

export const imagePasteRule: RichTextPasteRule = {
  transformHTML(html) {
    return transformPastedImageHtml(html)
  },
  handlePaste({ editor, event }) {
    const clipboardData = event.clipboardData

    if (clipboardData === null || isInternalRichTextHtml(clipboardData.getData('text/html'))) {
      return false
    }

    const imageFile = getFirstClipboardImageFile(clipboardData.files)

    if (imageFile === null) {
      return false
    }

    openImagePicker(editor, imageFile)
    return true
  },
}

export const insertImageAction = defineRichTextAction(imageFeature, {
  key: 'insert-image',
  command: ({ chain }, attrs: RichTextImageAttrs) =>
    chain()
      .focus()
      .command(({ commands, tr }) => {
        closeHistory(tr)
        return commands.insertContent({ type: 'image', attrs })
      })
      .run(),
})

export const insertImageActionItem = defineRichTextActionItem(insertImageAction, {
  label: '图片',
  icon: 'i-[lucide--image]',
  keywords: ['img', 'picture'],
})

export const updateImageAction = defineRichTextAction(imageFeature, {
  key: 'update-image',
  command: ({ chain, tr }, attrs: Partial<RichTextImageAttrs>) => {
    if (!(tr.selection instanceof NodeSelection) || tr.selection.node.type.name !== 'image') {
      return false
    }

    return chain().focus().updateAttributes('image', attrs).run()
  },
})

export const imageEditorFeature = defineRichTextEditorFeature(imageFeature, {
  interactions: [imagePicker.interaction],
  pasteRule: imagePasteRule,
})
