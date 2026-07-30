import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  exitSuggestion,
  findSuggestionMatch,
  Suggestion,
  type SuggestionOptions,
} from '@tiptap/suggestion'

const richTextSlashMenuViewPluginKey = new PluginKey('richTextSlashMenuView')
const richTextSlashMenuPluginKey = new PluginKey('richTextSlashMenu')

const allowRichTextSlashMenu: NonNullable<SuggestionOptions['allow']> = ({ state }) => {
  const { $from } = state.selection

  return $from.depth === 1 && $from.parent.type.name === 'paragraph'
}

export function registerRichTextSlashMenu(
  editor: Editor,
  renderer: ReturnType<NonNullable<SuggestionOptions['render']>>,
  container: HTMLElement,
) {
  const viewPlugin = new Plugin({
    key: richTextSlashMenuViewPluginKey,
    props: {
      handleDOMEvents: {
        compositionend(view) {
          queueMicrotask(() => {
            // Re-run Suggestion after ProseMirror clears its composing state.
            if (!view.isDestroyed) {
              view.dispatch(view.state.tr)
            }
          })
          return false
        },
      },
      decorations({ doc, selection }) {
        const { $from } = selection

        if (
          !editor.isEditable ||
          !selection.empty ||
          $from.depth !== 1 ||
          $from.parent.type.name !== 'paragraph' ||
          $from.parent.content.size !== 0
        ) {
          return DecorationSet.empty
        }

        return DecorationSet.create(doc, [
          Decoration.node($from.before(1), $from.after(1), {
            class: 'rich-text-slash-menu-placeholder',
            'data-placeholder': '开始输入，或按 / 唤起命令',
          }),
        ])
      },
    },
  })

  const suggestionPlugin = Suggestion({
    pluginKey: richTextSlashMenuPluginKey,
    editor,
    char: '/',
    startOfLine: true,
    findSuggestionMatch: (config) =>
      findSuggestionMatch({ ...config, allowSpaces: editor.view.composing }),
    placement: 'bottom-start',
    offset: { mainAxis: 8 },
    container,
    allow: allowRichTextSlashMenu,
    render: () => renderer,
  })

  editor.registerPlugin(viewPlugin, (plugin, editorPlugins) => [
    plugin,
    suggestionPlugin,
    ...editorPlugins,
  ])

  return () => {
    editor.unregisterPlugin([richTextSlashMenuViewPluginKey, richTextSlashMenuPluginKey])
  }
}

export function exitRichTextSlashMenu(editor: Editor) {
  exitSuggestion(editor.view, richTextSlashMenuPluginKey)
}
