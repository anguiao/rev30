import type { Editor } from '@tiptap/core'
import { CharacterCount } from '@tiptap/extensions/character-count'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { characterCountFeature } from '../core/feature'

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function countRichTextGraphemes(text: string) {
  return Array.from(graphemeSegmenter.segment(text)).length
}

export function countSelectedRichTextGraphemes(editor: Editor) {
  const { doc, selection } = editor.state
  const selectedDocument = doc.copy(selection.content().content)

  return editor.storage.characterCount.characters({ node: selectedDocument })
}

export const characterCountEditorFeature = defineRichTextEditorFeature(characterCountFeature, {
  extensions: () => [
    CharacterCount.configure({
      textCounter: countRichTextGraphemes,
    }),
  ],
})
