import { CharacterCount } from '@tiptap/extensions/character-count'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { characterCountFeature } from './shared'

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function countRichTextGraphemes(text: string) {
  return Array.from(graphemeSegmenter.segment(text)).length
}

export const characterCountEditorFeature = defineRichTextEditorFeature(characterCountFeature, {
  extensions: () => [
    CharacterCount.configure({
      limit: null,
      mode: 'textSize',
      textCounter: countRichTextGraphemes,
    }),
  ],
})
