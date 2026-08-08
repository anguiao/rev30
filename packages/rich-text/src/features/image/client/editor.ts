import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Slice } from '@tiptap/pm/model'
import { NodeSelection, type Selection } from '@tiptap/pm/state'
import { defineRichTextAction, defineRichTextActionItem } from '../../../client/editor/action'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { defineRichTextInteraction } from '../../../client/editor/interaction'
import type { RichTextPasteRule } from '../../../client/editor/paste'
import { imageFeature } from '../core/feature'

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

const proseMirrorSlicePattern = /^\d+ \d+(?: -\d+)? (.+)$/

function hasProseMirrorSliceMarker(content: DocumentFragment) {
  let element = content.firstElementChild
  while (element?.tagName === 'META') {
    element = element.nextElementSibling
  }

  const slice = element?.getAttribute('data-pm-slice')
  if (!slice) {
    return false
  }

  const serializedContext = proseMirrorSlicePattern.exec(slice)?.[1]
  if (serializedContext === undefined) {
    return false
  }

  try {
    const context = JSON.parse(serializedContext)

    return Array.isArray(context) && context.length % 2 === 0
  } catch {
    return false
  }
}

function hasImageNode(slice: Slice) {
  let found = false

  slice.content.descendants((node) => {
    if (node.type.name === 'image') {
      found = true
    }
  })

  return found
}

export function transformPastedImageHtml(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html

  if (hasProseMirrorSliceMarker(template.content)) {
    return html
  }

  for (const image of template.content.querySelectorAll('img')) {
    image.remove()
  }

  return template.innerHTML
}

export function getPastedImageFile(event: ClipboardEvent) {
  const clipboardData = event.clipboardData
  if (clipboardData === null) {
    return null
  }

  for (let index = 0; index < clipboardData.files.length; index += 1) {
    const file = clipboardData.files.item(index)

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

export const imageAction = defineRichTextAction(imageFeature, {
  key: imageFeature.key,
  command: (props) => imagePicker.command(props, undefined),
})

export const imageActionItem = defineRichTextActionItem(imageAction, {
  label: '图片',
  icon: 'i-[lucide--image]',
  keywords: ['img', 'picture'],
})

export const imagePasteRule: RichTextPasteRule = {
  transformHTML(html) {
    return transformPastedImageHtml(html)
  },
  handlePaste({ editor, event, slice }) {
    const imageFile = getPastedImageFile(event)

    if (imageFile === null || hasImageNode(slice)) {
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
  interactions: [imagePicker],
  pasteRule: imagePasteRule,
})
