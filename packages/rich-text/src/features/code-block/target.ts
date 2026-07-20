import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { captureRichTextSelection, type RichTextSelectionSnapshot } from '../../vue/selection'

export interface RichTextCodeBlockTarget {
  readonly position: number
  readonly node: ProseMirrorNode
  readonly selection: RichTextSelectionSnapshot
}

function findCodeBlock($position: ResolvedPos) {
  for (let depth = $position.depth; depth > 0; depth--) {
    const node = $position.node(depth)

    if (node.type.name === 'codeBlock') {
      return {
        position: $position.before(depth),
        node,
      }
    }
  }

  return null
}

export function resolveRichTextCodeBlockTarget(editor: Editor): RichTextCodeBlockTarget | null {
  const { selection } = editor.state

  if (!(selection instanceof TextSelection)) {
    return null
  }

  const codeBlock = findCodeBlock(selection.$from)

  if (!codeBlock) {
    return null
  }

  const contentFrom = codeBlock.position + 1
  const contentTo = contentFrom + codeBlock.node.content.size

  if (selection.from < contentFrom || selection.to > contentTo) {
    return null
  }

  return Object.freeze({
    ...codeBlock,
    selection: captureRichTextSelection(editor),
  })
}

export function isRichTextCodeBlockTargetValid(editor: Editor, target: RichTextCodeBlockTarget) {
  const node = editor.state.doc.nodeAt(target.position)

  return node?.type.name === 'codeBlock' && node.eq(target.node)
}

export function getRichTextCodeBlockLanguage(target: RichTextCodeBlockTarget) {
  return typeof target.node.attrs.language === 'string' && target.node.attrs.language
    ? target.node.attrs.language
    : 'plaintext'
}
