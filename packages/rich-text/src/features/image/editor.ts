import { NodeSelection, type Transaction } from '@tiptap/pm/state'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { imageFeature, type RichTextImageAttrsPatch, type RichTextImageInput } from './shared'

function findInsertedImagePosition(transaction: Transaction, firstStepIndex: number) {
  if (
    transaction.selection instanceof NodeSelection &&
    transaction.selection.node.type.name === 'image'
  ) {
    return transaction.selection.from
  }

  let imagePosition: number | undefined

  for (let index = firstStepIndex; index < transaction.mapping.maps.length; index++) {
    const map = transaction.mapping.maps[index]!
    const remainingMapping = transaction.mapping.slice(index + 1)

    map.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      if (imagePosition !== undefined) {
        return
      }

      const from = remainingMapping.map(newFrom, 1)
      const to = remainingMapping.map(newTo, -1)

      transaction.doc.nodesBetween(from, to, (node, position) => {
        if (node.type.name !== 'image') {
          return
        }

        imagePosition = position
        return false
      })
    })

    if (imagePosition !== undefined) {
      return imagePosition
    }
  }

  return undefined
}

export const insertImageAction = defineRichTextAction(imageFeature, {
  key: 'insert-image',
  command:
    (attrs: RichTextImageInput) =>
    ({ chain }) =>
      chain()
        .focus()
        .command(({ commands, tr, dispatch }) => {
          const firstStepIndex = tr.steps.length

          if (!commands.insertContent({ type: 'image', attrs })) {
            return false
          }

          if (!dispatch) {
            return true
          }

          const imagePosition = findInsertedImagePosition(tr, firstStepIndex)

          if (imagePosition === undefined) {
            return false
          }

          tr.setSelection(NodeSelection.create(tr.doc, imagePosition))
          return true
        })
        .run(),
})

export const updateImageAction = defineRichTextAction(imageFeature, {
  key: 'update-image',
  command:
    (attrs: RichTextImageAttrsPatch) =>
    ({ chain, tr }) => {
      if (!(tr.selection instanceof NodeSelection) || tr.selection.node.type.name !== 'image') {
        return false
      }

      const imagePosition = tr.selection.from

      return chain()
        .focus()
        .updateAttributes('image', attrs)
        .command(({ tr: transaction, dispatch }) => {
          if (dispatch) {
            transaction.setSelection(NodeSelection.create(transaction.doc, imagePosition))
          }

          return true
        })
        .run()
    },
})

export const imageEditorFeature = defineRichTextEditorFeature(imageFeature, {})
