import type { Command, Editor, Range } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { PluginKey, TextSelection } from '@tiptap/pm/state'
import { markRaw, type Component } from 'vue'
import type { RichTextFeature } from '../core/feature'
import type { RichTextActionItem, RichTextIconClass } from './action-item'

export const richTextBlockMenuPluginKey = new PluginKey('richTextBlockMenu')

export type RichTextBlockCommandSource = 'plus' | 'slash'

interface RichTextBlockCommandBase {
  readonly type: 'action' | 'ui'
  readonly feature: RichTextFeature
  readonly key: string
  readonly label: string
  readonly icon: RichTextIconClass
  readonly keywords: readonly string[]
}

export interface RichTextBlockActionCommand extends RichTextBlockCommandBase {
  readonly type: 'action'
  readonly item: RichTextActionItem
}

export interface RichTextBlockUiCommandContext {
  readonly editor: Editor
  readonly source: RichTextBlockCommandSource
  readonly anchor: number
  readonly queryRange?: Range
}

export interface RichTextBlockUiCommand extends RichTextBlockCommandBase {
  readonly type: 'ui'
  readonly isEnabled?: (context: RichTextBlockUiCommandContext) => boolean
  readonly run: (context: RichTextBlockUiCommandContext) => boolean
}

export type RichTextBlockCommand = RichTextBlockActionCommand | RichTextBlockUiCommand

export interface RichTextBlockCommandGroup {
  readonly key: string
  readonly label: string
  readonly commands: readonly RichTextBlockCommand[]
}

export interface RichTextBlockMenuConfig {
  readonly groups: readonly RichTextBlockCommandGroup[]
  readonly component?: Component
}

export type RichTextBlockCommandInvocation =
  | {
      readonly source: 'plus'
      readonly anchor: number
    }
  | {
      readonly source: 'slash'
      readonly queryRange: Range
    }

export function richTextBlockMenuAction(
  item: RichTextActionItem,
  keywords: readonly string[],
): RichTextBlockActionCommand {
  return Object.freeze({
    type: 'action',
    feature: item.action.feature,
    key: item.action.key,
    label: item.label,
    icon: item.icon,
    item,
    keywords: Object.freeze([...keywords]),
  })
}

export function richTextBlockMenuUiCommand(
  command: Omit<RichTextBlockUiCommand, 'type' | 'keywords'> & {
    readonly keywords: readonly string[]
  },
): RichTextBlockUiCommand {
  return Object.freeze({
    ...command,
    type: 'ui',
    keywords: Object.freeze([...command.keywords]),
  })
}

export function defineRichTextBlockMenu(
  groups: readonly RichTextBlockCommandGroup[],
  component?: Component,
): RichTextBlockMenuConfig {
  const groupKeys = new Set<string>()
  const commandKeys = new Set<string>()

  const frozenGroups = groups.map((group) => {
    if (groupKeys.has(group.key)) {
      throw new Error(`Rich text block menu has a duplicate group: "${group.key}"`)
    }

    groupKeys.add(group.key)

    const commands = group.commands.map((command) => {
      if (commandKeys.has(command.key)) {
        throw new Error(`Rich text block menu has a duplicate command: "${command.key}"`)
      }

      commandKeys.add(command.key)
      return command
    })

    return Object.freeze({
      ...group,
      commands: Object.freeze(commands),
    })
  })

  return Object.freeze({
    groups: Object.freeze(frozenGroups),
    ...(component ? { component: markRaw(component) } : {}),
  })
}

export function getRichTextBlockCommandFeature(command: RichTextBlockCommand) {
  return command.feature
}

export function filterRichTextBlockMenu(config: RichTextBlockMenuConfig, query: string) {
  const normalizedQuery = query.toLocaleLowerCase()

  if (!normalizedQuery) {
    return config.groups
  }

  return config.groups.flatMap((group) => {
    const commands = group.commands.filter((command) => {
      return [command.label, ...command.keywords].some((term) =>
        term.toLocaleLowerCase().includes(normalizedQuery),
      )
    })

    return commands.length
      ? [
          Object.freeze({
            ...group,
            commands: Object.freeze(commands),
          }),
        ]
      : []
  })
}

export function resolveEmptyTopLevelParagraphAnchor(editor: Editor) {
  const { selection } = editor.state
  const { $from } = selection

  if (
    !selection.empty ||
    $from.depth !== 1 ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parent.content.size !== 0
  ) {
    return undefined
  }

  return $from.before(1)
}

export function isEmptyTopLevelParagraphAnchor(editor: Editor, anchor: number) {
  const node = editor.state.doc.nodeAt(anchor)

  return node?.type.name === 'paragraph' && node.content.size === 0
}

function resolveSlashCommandAnchor(editor: Editor, range: Range) {
  const { selection } = editor.state
  const { $from } = selection

  if (
    !selection.empty ||
    $from.depth !== 1 ||
    $from.parent.type.name !== 'paragraph' ||
    range.from !== $from.start(1) ||
    range.to !== selection.from ||
    range.to !== $from.end(1)
  ) {
    return undefined
  }

  return $from.before(1)
}

function createUiCommandContext(
  editor: Editor,
  invocation: RichTextBlockCommandInvocation,
  anchor: number,
): RichTextBlockUiCommandContext {
  return {
    editor,
    source: invocation.source,
    anchor,
    ...(invocation.source === 'slash' ? { queryRange: invocation.queryRange } : {}),
  }
}

function setPlusCommandSelection(anchor: number): Command {
  return ({ tr }) => {
    const node = tr.doc.nodeAt(anchor)

    if (node?.type.name !== 'paragraph' || node.content.size !== 0) {
      return false
    }

    tr.setSelection(TextSelection.create(tr.doc, anchor + 1))
    return true
  }
}

export function canRunRichTextBlockMenuCommand(
  editor: Editor,
  command: RichTextBlockCommand,
  invocation: RichTextBlockCommandInvocation,
) {
  const anchor =
    invocation.source === 'plus'
      ? isEmptyTopLevelParagraphAnchor(editor, invocation.anchor)
        ? invocation.anchor
        : undefined
      : resolveSlashCommandAnchor(editor, invocation.queryRange)

  if (anchor === undefined) {
    return false
  }

  if (command.type === 'ui') {
    const canDeleteQuery =
      invocation.source === 'plus' || editor.can().chain().deleteRange(invocation.queryRange).run()
    const context = createUiCommandContext(editor, invocation, anchor)

    return canDeleteQuery && (command.isEnabled?.(context) ?? true)
  }

  if (invocation.source === 'slash') {
    return editor
      .can()
      .chain()
      .deleteRange(invocation.queryRange)
      .command(({ tr, dispatch }) => {
        if (!dispatch) {
          tr.delete(invocation.queryRange.from, invocation.queryRange.to)
        }

        return true
      })
      .command(command.item.action.command())
      .run()
  }

  return editor
    .can()
    .chain()
    .command(setPlusCommandSelection(anchor))
    .command(command.item.action.command())
    .run()
}

export function runRichTextBlockMenuCommand(
  editor: Editor,
  command: RichTextBlockCommand,
  invocation: RichTextBlockCommandInvocation,
) {
  if (!canRunRichTextBlockMenuCommand(editor, command, invocation)) {
    return false
  }

  if (command.type === 'action') {
    const actionCommand = command.item.action.command()

    if (invocation.source === 'slash') {
      return editor
        .chain()
        .focus()
        .command(({ tr }) => {
          closeHistory(tr)
          return true
        })
        .deleteRange(invocation.queryRange)
        .command((props) => {
          const handled = actionCommand(props)

          if (!handled) {
            props.tr.setMeta('preventDispatch', true)
          }

          return handled
        })
        .run()
    }

    return editor
      .chain()
      .command(setPlusCommandSelection(invocation.anchor))
      .command((props) => {
        const handled = actionCommand(props)

        if (!handled) {
          props.tr.setMeta('preventDispatch', true)
        }

        return handled
      })
      .run()
  }

  if (invocation.source === 'plus') {
    if (!editor.chain().command(setPlusCommandSelection(invocation.anchor)).run()) {
      return false
    }

    return command.run(createUiCommandContext(editor, invocation, invocation.anchor))
  }

  const expectedAnchor = resolveSlashCommandAnchor(editor, invocation.queryRange)

  if (
    expectedAnchor === undefined ||
    !editor
      .chain()
      .focus()
      .command(({ tr }) => {
        closeHistory(tr)
        return true
      })
      .deleteRange(invocation.queryRange)
      .run()
  ) {
    return false
  }

  const anchor = resolveEmptyTopLevelParagraphAnchor(editor)

  if (anchor !== expectedAnchor) {
    return false
  }

  const context = createUiCommandContext(editor, invocation, anchor)

  return (command.isEnabled?.(context) ?? true) && command.run(context)
}
