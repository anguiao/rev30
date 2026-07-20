import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { shallowReadonly, shallowRef, type Ref } from 'vue'
import { captureRichTextSelection, type RichTextSelectionSnapshot } from '../../../vue/selection'
import type { RichTextImageAttrs } from '../shared'

export interface RichTextImageDialogOptions {
  readonly upload: (file: File) => Promise<{ src: string }>
  readonly onError?: (error: unknown) => void
}

export type RichTextImageDialogSource = 'toolbar' | 'quickbar' | 'plus' | 'slash'

interface RichTextImageInsertSelectionTarget {
  readonly type: 'insert-selection'
  readonly selection: RichTextSelectionSnapshot
}

interface RichTextImageInsertAnchorTarget {
  readonly type: 'insert-anchor'
  readonly anchor: number
  readonly paragraph: ProseMirrorNode
  readonly selection: RichTextSelectionSnapshot
}

interface RichTextImageEditTarget {
  readonly type: 'edit'
  readonly position: number
  readonly node: ProseMirrorNode
  readonly attrs: RichTextImageAttrs
  readonly selection: RichTextSelectionSnapshot
}

export type RichTextImageDialogTarget =
  | RichTextImageInsertSelectionTarget
  | RichTextImageInsertAnchorTarget
  | RichTextImageEditTarget

export interface RichTextImageDialogSession {
  readonly owner: symbol
  readonly source: RichTextImageDialogSource
  readonly target: RichTextImageDialogTarget
  readonly options: RichTextImageDialogOptions
}

export interface RichTextImageDialogController {
  readonly session: Readonly<Ref<RichTextImageDialogSession | null>>
  open: (
    source: RichTextImageDialogSource,
    target: RichTextImageDialogTarget,
    options: RichTextImageDialogOptions,
  ) => RichTextImageDialogSession
  close: (session: RichTextImageDialogSession) => void
}

const controllers = new WeakMap<Editor, RichTextImageDialogController>()

export function resolveRichTextImageToolbarTarget(
  editor: Editor,
): RichTextImageDialogTarget | null {
  const { selection } = editor.state

  if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
    return Object.freeze({
      type: 'edit',
      position: selection.from,
      node: selection.node,
      attrs: Object.freeze({ ...selection.node.attrs }) as RichTextImageAttrs,
      selection: captureRichTextSelection(editor),
    })
  }

  if (selection instanceof TextSelection && selection.empty) {
    return Object.freeze({
      type: 'insert-selection',
      selection: captureRichTextSelection(editor),
    })
  }

  return null
}

export function resolveRichTextImageQuickbarTarget(editor: Editor) {
  const target = resolveRichTextImageToolbarTarget(editor)

  return target?.type === 'edit' ? target : null
}

export function resolveRichTextImageAnchorTarget(editor: Editor, anchor: number) {
  const paragraph = editor.state.doc.nodeAt(anchor)

  if (paragraph?.type.name !== 'paragraph' || paragraph.content.size !== 0) {
    return null
  }

  return Object.freeze({
    type: 'insert-anchor' as const,
    anchor,
    paragraph,
    selection: captureRichTextSelection(editor),
  })
}

export function isRichTextImageDialogTargetValid(
  editor: Editor,
  target: RichTextImageDialogTarget,
) {
  if (target.type === 'insert-selection') {
    return target.selection.empty && target.selection.from <= editor.state.doc.content.size
  }

  const node = editor.state.doc.nodeAt(target.type === 'edit' ? target.position : target.anchor)

  return node?.eq(target.type === 'edit' ? target.node : target.paragraph) ?? false
}

function createRichTextImageDialogController(): RichTextImageDialogController {
  const session = shallowRef<RichTextImageDialogSession | null>(null)

  return {
    session: shallowReadonly(session),
    open(source, target, options) {
      const nextSession = Object.freeze({
        owner: Symbol('rich-text-image-dialog'),
        source,
        target,
        options,
      })
      session.value = nextSession
      return nextSession
    },
    close(activeSession) {
      if (session.value === activeSession) {
        session.value = null
      }
    },
  }
}

export function getRichTextImageDialogController(editor: Editor) {
  const existing = controllers.get(editor)

  if (existing) {
    return existing
  }

  const controller = createRichTextImageDialogController()
  controllers.set(editor, controller)
  return controller
}
