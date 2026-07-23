import type { Editor } from '@tiptap/core'
import type { Selection } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import type { RichTextFeatureQuickBar, RichTextQuickBarConfig, RichTextQuickBarControls } from '.'

export type RichTextQuickBarMatch =
  | {
      readonly type: 'feature'
      readonly quickBar: RichTextFeatureQuickBar
    }
  | {
      readonly type: 'text'
      readonly controls: RichTextQuickBarControls
    }

function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

function isTextQuickBarSelection(selection: Selection) {
  if (!(selection instanceof TextSelection) || selection.empty) {
    return false
  }

  const doc = selection.$from.doc
  let hasText = false
  let hasExcludedNode = false

  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.type.name === 'codeBlock' || (node.isAtom && !node.isText)) {
      hasExcludedNode = true
      return false
    }

    if (node.isText) {
      hasText = true
    }
  })

  return hasText && !hasExcludedNode
}

export function resolveRichTextQuickBar(
  editor: Editor,
  quickBar: RichTextQuickBarConfig,
): RichTextQuickBarMatch | null {
  if (!editor.isEditable || isCoarsePointer()) {
    return null
  }

  const featureQuickBar = quickBar.featureBars.find((candidate) => candidate.isActive(editor))

  if (featureQuickBar) {
    return {
      type: 'feature',
      quickBar: featureQuickBar,
    }
  }

  if (quickBar.textControls && isTextQuickBarSelection(editor.state.selection)) {
    return {
      type: 'text',
      controls: quickBar.textControls,
    }
  }

  return null
}
