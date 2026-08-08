import { CharacterCount } from '@tiptap/extensions/character-count'
import { defineRichTextEditorFeature } from '../../../client/editor/feature'
import { characterCountFeature } from '../core/feature'

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function countRichTextGraphemes(text: string) {
  return Array.from(graphemeSegmenter.segment(text)).length
}

export const characterCountEditorFeature = defineRichTextEditorFeature(characterCountFeature, {
  extensions: () => [
    CharacterCount.configure({
      textCounter: countRichTextGraphemes,
    }),
  ],
})
