import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { RichTextFeatureQuickbarConfig, RichTextQuickbarConfig } from '../quickbar'

export type RichTextQuickbarContext =
  | {
      readonly type: 'feature'
      readonly feature: RichTextFeatureQuickbarConfig
    }
  | {
      readonly type: 'text'
    }

export function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

export function isRichTextTextQuickbarSelection(editor: Editor) {
  const { doc, selection } = editor.state

  if (!(selection instanceof TextSelection) || selection.empty) {
    return false
  }

  let containsText = false
  let isSupported = true

  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.type.name === 'codeBlock' || (node.isAtom && !node.isText)) {
      isSupported = false
      return false
    }

    if (node.isText) {
      containsText = true
    }

    return isSupported
  })

  return isSupported && containsText
}

export function resolveRichTextQuickbarContext(
  editor: Editor,
  quickbar: RichTextQuickbarConfig,
): RichTextQuickbarContext | null {
  if (!editor.isEditable || isCoarsePointer()) {
    return null
  }

  const feature = quickbar.features.find((candidate) => candidate.isActive(editor))

  if (feature) {
    return { type: 'feature', feature }
  }

  return quickbar.text && isRichTextTextQuickbarSelection(editor) ? { type: 'text' } : null
}
