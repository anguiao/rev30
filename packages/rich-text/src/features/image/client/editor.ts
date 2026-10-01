import { Extension, type Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Slice } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, type Selection } from '@tiptap/pm/state'
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

export function getPastedImageFiles(event: ClipboardEvent) {
  const clipboardData = event.clipboardData
  if (clipboardData === null) {
    return []
  }

  const images: File[] = []
  for (let index = 0; index < clipboardData.files.length; index += 1) {
    const file = clipboardData.files.item(index)

    if (file?.type.startsWith('image/')) {
      images.push(file)
    }
  }

  return images
}

const imagePicker = defineRichTextInteraction<typeof imageFeature, File[] | undefined>(
  imageFeature,
  'pick-image',
)

export function openImagePicker(editor: Editor, pastedFiles?: File[]) {
  imagePicker.request(editor, pastedFiles)
}

export function defineImagePickerHandler(handle: (editor: Editor, pastedFiles?: File[]) => void) {
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
    const imageFiles = getPastedImageFiles(event)

    if (imageFiles.length === 0 || hasImageNode(slice)) {
      return false
    }

    openImagePicker(editor, imageFiles)
    return true
  },
}

export const insertImagesAction = defineRichTextAction(imageFeature, {
  key: 'insert-images',
  command: ({ chain }, images: RichTextImageAttrs[]) => {
    if (images.length === 0) {
      return false
    }

    return chain()
      .focus()
      .command(({ commands, tr }) => {
        const inserted = commands.insertContent(images.map((attrs) => ({ type: 'image', attrs })))

        if (inserted) {
          closeHistory(tr)
          tr.setMeta(imageBatchHistoryKey, true)
        }

        return inserted
      })
      .run()
  },
})

const imageBatchHistoryKey = new PluginKey('imageBatchHistory')

const imageBatchHistoryExtension = Extension.create({
  name: 'imageBatchHistory',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: imageBatchHistoryKey,
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.some((transaction) => transaction.getMeta(imageBatchHistoryKey))) {
            return closeHistory(newState.tr)
          }

          return null
        },
      }),
    ]
  },
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
  extensions: () => [imageBatchHistoryExtension],
  interactions: [imagePicker],
  pasteRule: imagePasteRule,
})
