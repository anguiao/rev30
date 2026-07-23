import type { Command, CommandProps } from '@tiptap/core'
import { liftTarget } from '@tiptap/pm/transform'
import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { listFeature } from './shared'

function simulateClearNodes({ state, tr }: Pick<CommandProps, 'state' | 'tr'>) {
  for (const { $from, $to } of tr.selection.ranges) {
    state.doc.nodesBetween($from.pos, $to.pos, (node, position) => {
      if (node.type.isText) {
        return
      }

      const $mappedFrom = tr.doc.resolve(tr.mapping.map(position))
      const $mappedTo = tr.doc.resolve(tr.mapping.map(position + node.nodeSize))
      const nodeRange = $mappedFrom.blockRange($mappedTo)

      if (!nodeRange) {
        return
      }

      const targetLiftDepth = liftTarget(nodeRange)

      if (node.type.isTextblock) {
        const { defaultType } = $mappedFrom.parent.contentMatchAt($mappedFrom.index())
        tr.setNodeMarkup(nodeRange.start, defaultType)
      }

      if (targetLiftDepth !== null) {
        tr.lift(nodeRange, targetLiftDepth)
      }
    })
  }
}

function createToggleListCommand(type: 'bullet' | 'ordered'): Command {
  return ({ chain, dispatch, state, tr }) => {
    const toggleList = () => {
      const chainedCommands = chain().focus()
      return type === 'bullet'
        ? chainedCommands.toggleBulletList().run()
        : chainedCommands.toggleOrderedList().run()
    }

    if (dispatch || toggleList()) {
      return dispatch ? toggleList() : true
    }

    simulateClearNodes({ state, tr })
    return toggleList()
  }
}

export const listActions = [
  defineRichTextAction(listFeature, {
    key: 'bullet-list',
    command: () => createToggleListCommand('bullet'),
    isActive: (editor) => editor.isActive('bulletList'),
  }),
  defineRichTextAction(listFeature, {
    key: 'ordered-list',
    command: () => createToggleListCommand('ordered'),
    isActive: (editor) => editor.isActive('orderedList'),
  }),
] as const

export const listActionItems = [
  defineRichTextActionItem(listActions[0], {
    label: '无序列表',
    icon: 'i-[lucide--list]',
    keywords: ['项目符号', 'unordered', 'ul'],
  }),
  defineRichTextActionItem(listActions[1], {
    label: '有序列表',
    icon: 'i-[lucide--list-ordered]',
    keywords: ['编号列表', 'numbered', 'ol'],
  }),
] as const

export const listEditorFeature = defineRichTextEditorFeature(listFeature, {})
