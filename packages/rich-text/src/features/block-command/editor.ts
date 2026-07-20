import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import {
  exitSuggestion,
  findSuggestionMatch,
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { blockCommandFeature } from './shared'

interface RichTextSlashCommandPluginState {
  readonly active: boolean
}

export const richTextSlashCommandPluginKey = new PluginKey<RichTextSlashCommandPluginState>(
  'richTextSlashCommand',
)

const richTextSlashCommandInputPluginKey = new PluginKey('richTextSlashCommandInput')
const richTextSlashCommandExtensionName = 'richTextSlashCommand'

export type RichTextSlashCommandSuggestionProps = SuggestionProps<never, never>

export interface RichTextSlashCommandRenderer {
  readonly onStart?: (props: RichTextSlashCommandSuggestionProps) => void
  readonly onUpdate?: (props: RichTextSlashCommandSuggestionProps) => void
  readonly onExit?: (props: RichTextSlashCommandSuggestionProps) => void
  readonly onKeyDown?: (props: SuggestionKeyDownProps) => boolean
}

interface PendingTextInput {
  readonly type: 'text'
  readonly doc: ProseMirrorNode
  readonly from: number
  readonly to: number
  readonly text: string
}

interface PendingKeyboardInput {
  readonly type: 'keyboard'
  readonly doc: ProseMirrorNode
}

type PendingUserInput = PendingTextInput | PendingKeyboardInput

interface RichTextSlashCommandStorage {
  composing: boolean
  pendingInput: PendingUserInput | undefined
  renderer: RichTextSlashCommandRenderer | undefined
  rendererToken: symbol | undefined
  wasActive: boolean
}

function getRichTextSlashCommandStorage(editor: Editor) {
  const storage = (editor.storage as unknown as Record<string, unknown>)[
    richTextSlashCommandExtensionName
  ] as RichTextSlashCommandStorage | undefined

  if (!storage) {
    throw new Error('Rich text slash command extension is not installed')
  }

  return storage
}

function setPendingInput(storage: RichTextSlashCommandStorage, pendingInput: PendingUserInput) {
  storage.pendingInput = pendingInput

  queueMicrotask(() => {
    if (storage.pendingInput === pendingInput) {
      storage.pendingInput = undefined
    }
  })
}

function isPendingInputTransaction(storage: RichTextSlashCommandStorage, transaction: Transaction) {
  return storage.pendingInput?.doc === transaction.before
}

const RichTextSlashCommand = Extension.create<Record<string, never>, RichTextSlashCommandStorage>({
  name: richTextSlashCommandExtensionName,

  addStorage() {
    return {
      composing: false,
      pendingInput: undefined,
      renderer: undefined,
      rendererToken: undefined,
      wasActive: false,
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    const storage = this.storage

    const inputPlugin = new Plugin({
      key: richTextSlashCommandInputPluginKey,
      props: {
        handleTextInput(view, from, to, text) {
          setPendingInput(storage, {
            type: 'text',
            doc: view.state.doc,
            from,
            to,
            text,
          })

          return false
        },
        handleKeyDown(view, event) {
          if (
            (event.key === 'Backspace' || event.key === 'Delete') &&
            richTextSlashCommandPluginKey.getState(view.state)?.active
          ) {
            setPendingInput(storage, {
              type: 'keyboard',
              doc: view.state.doc,
            })
          }

          return false
        },
        handleDOMEvents: {
          compositionstart(view) {
            storage.composing = view.state.selection.empty
            return false
          },
          compositionend(view) {
            queueMicrotask(() => {
              storage.composing = false

              if (!editor.isDestroyed) {
                view.dispatch(
                  view.state.tr.setMeta(richTextSlashCommandInputPluginKey, 'compositionend'),
                )
              }
            })
            return false
          },
        },
      },
    })

    const suggestionPlugin = Suggestion<never, never>({
      pluginKey: richTextSlashCommandPluginKey,
      editor,
      char: '/',
      startOfLine: true,
      allowedPrefixes: null,
      allowSpaces: false,
      findSuggestionMatch: (config) =>
        findSuggestionMatch({ ...config, allowSpaces: storage.composing }),
      placement: 'bottom-start',
      offset: { mainAxis: 8 },
      items: () => [],
      allow: ({ state, range, isActive }) => {
        storage.wasActive = isActive ?? false

        const { selection } = state
        const { $from } = selection

        return (
          selection.empty &&
          $from.depth === 1 &&
          $from.parent.type.name === 'paragraph' &&
          range.from === $from.start(1)
        )
      },
      shouldShow: ({ transaction }) => {
        const pendingInput = storage.pendingInput
        const directInput = isPendingInputTransaction(storage, transaction)

        if (storage.wasActive) {
          return !transaction.docChanged || directInput || storage.composing
        }

        return (
          (directInput &&
            pendingInput?.type === 'text' &&
            pendingInput.from === pendingInput.to &&
            pendingInput.text === '/') ||
          storage.composing
        )
      },
      render: () => ({
        onStart: (props) => storage.renderer?.onStart?.(props),
        onUpdate: (props) => storage.renderer?.onUpdate?.(props),
        onExit: (props) => storage.renderer?.onExit?.(props),
        onKeyDown: (props) => storage.renderer?.onKeyDown?.(props) ?? false,
      }),
    })

    return [inputPlugin, suggestionPlugin]
  },
})

export function registerRichTextSlashCommandRenderer(
  editor: Editor,
  renderer: RichTextSlashCommandRenderer,
) {
  const storage = getRichTextSlashCommandStorage(editor)
  const token = Symbol('richTextSlashCommandRenderer')

  storage.renderer = renderer
  storage.rendererToken = token

  return () => {
    if (storage.rendererToken !== token) {
      return
    }

    storage.renderer = undefined
    storage.rendererToken = undefined
  }
}

export function exitRichTextSlashCommand(editor: Editor) {
  if (!editor.isDestroyed) {
    exitSuggestion(editor.view, richTextSlashCommandPluginKey)
  }
}

export function isRichTextSlashCommandActive(editor: Editor) {
  return Boolean(richTextSlashCommandPluginKey.getState(editor.state)?.active)
}

export const blockCommandEditorFeature = defineRichTextEditorFeature(blockCommandFeature, {
  extensions: () => [RichTextSlashCommand],
})
