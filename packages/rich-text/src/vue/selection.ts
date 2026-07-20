import type { Command, Editor } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'
import type { SelectionBookmark } from '@tiptap/pm/state'

export const richTextSurfaceTransactionMeta = 'richTextSurfaceTransaction'

export interface RichTextSelectionSnapshot {
  readonly bookmark: SelectionBookmark
  readonly from: number
  readonly to: number
  readonly empty: boolean
  readonly storedMarks: readonly Mark[] | null
}

export function captureRichTextSelection(editor: Editor): RichTextSelectionSnapshot {
  const { selection } = editor.state

  return Object.freeze({
    bookmark: selection.getBookmark(),
    from: selection.from,
    to: selection.to,
    empty: selection.empty,
    storedMarks: editor.state.storedMarks ? Object.freeze([...editor.state.storedMarks]) : null,
  })
}

export function restoreRichTextSelectionCommand(
  snapshot: RichTextSelectionSnapshot,
  preserveTransactionStoredMarks = false,
): Command {
  return ({ dispatch, tr }) => {
    if (dispatch) {
      const storedMarks = preserveTransactionStoredMarks ? tr.storedMarks : snapshot.storedMarks
      tr.setSelection(snapshot.bookmark.map(tr.mapping).resolve(tr.doc))

      if (snapshot.empty) {
        tr.setStoredMarks(storedMarks)
      }
    }

    return true
  }
}

export function markRichTextSurfaceTransactionCommand(owner: symbol): Command {
  return ({ dispatch, tr }) => {
    if (dispatch) {
      tr.setMeta(richTextSurfaceTransactionMeta, owner)
    }

    return true
  }
}

export function restoreRichTextSelection(
  editor: Editor,
  snapshot: RichTextSelectionSnapshot,
  focus = true,
) {
  const chain = editor.chain().command(restoreRichTextSelectionCommand(snapshot))

  if (focus) {
    chain.focus()
  }

  return chain.run()
}
