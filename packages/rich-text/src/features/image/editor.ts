import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection, type Selection } from '@tiptap/pm/state'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
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

export const insertImageAction = defineRichTextAction(imageFeature, {
  key: 'insert-image',
  command:
    (attrs: RichTextImageAttrs) =>
    ({ chain }) =>
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
  command:
    (attrs: Partial<RichTextImageAttrs>) =>
    ({ chain, tr }) => {
      if (!(tr.selection instanceof NodeSelection) || tr.selection.node.type.name !== 'image') {
        return false
      }

      return chain().focus().updateAttributes('image', attrs).run()
    },
})

export const imageEditorFeature = defineRichTextEditorFeature(imageFeature, {})
