import type { Editor, Range } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { markRaw, type Component } from 'vue'
import type { RichTextFeature } from '../core/feature'
import type { RichTextActionItem, RichTextIconClass } from '../editor/action'

interface RichTextSlashCommandBase {
  readonly type: 'action' | 'ui'
  readonly feature: RichTextFeature
  readonly key: string
  readonly label: string
  readonly icon: RichTextIconClass
  readonly keywords: readonly string[]
}

export interface RichTextSlashActionCommand extends RichTextSlashCommandBase {
  readonly type: 'action'
  readonly item: RichTextActionItem
}

export interface RichTextSlashUiCommandContext {
  readonly editor: Editor
  readonly anchor: number
}

export interface RichTextSlashUiCommand extends RichTextSlashCommandBase {
  readonly type: 'ui'
  readonly isEnabled?: (context: RichTextSlashUiCommandContext) => boolean
  readonly run: (context: RichTextSlashUiCommandContext) => boolean
}

export type RichTextSlashCommand = RichTextSlashActionCommand | RichTextSlashUiCommand

export interface RichTextSlashCommandGroup {
  readonly key: string
  readonly label: string
  readonly commands: readonly RichTextSlashCommand[]
}

export interface RichTextSlashCommandConfig {
  readonly groups: readonly RichTextSlashCommandGroup[]
  readonly component?: Component
}

export function richTextSlashCommandAction(item: RichTextActionItem): RichTextSlashActionCommand {
  return Object.freeze({
    type: 'action',
    feature: item.action.feature,
    key: item.action.key,
    label: item.label,
    icon: item.icon,
    item,
    keywords: item.keywords,
  })
}

export function richTextSlashUiCommand<
  const Feature extends RichTextFeature,
  const Key extends string,
  Arguments extends unknown[],
>(
  item: RichTextActionItem<Feature, Key, Arguments>,
  command: Pick<RichTextSlashUiCommand, 'isEnabled' | 'run'>,
): RichTextSlashUiCommand {
  return Object.freeze({
    ...command,
    type: 'ui',
    feature: item.action.feature,
    key: item.action.key,
    label: item.label,
    icon: item.icon,
    keywords: item.keywords,
  })
}

export function defineRichTextSlashCommand(
  groups: readonly RichTextSlashCommandGroup[],
  component?: Component,
): RichTextSlashCommandConfig {
  const groupKeys = new Set<string>()
  const commandKeys = new Set<string>()

  const frozenGroups = groups.map((group) => {
    if (groupKeys.has(group.key)) {
      throw new Error(`Rich text slash command has a duplicate group: "${group.key}"`)
    }

    groupKeys.add(group.key)

    const commands = group.commands.map((command) => {
      if (commandKeys.has(command.key)) {
        throw new Error(`Rich text slash command has a duplicate command: "${command.key}"`)
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

export function getRichTextSlashCommandFeature(command: RichTextSlashCommand) {
  return command.feature
}

export function filterRichTextSlashCommands(config: RichTextSlashCommandConfig, query: string) {
  const normalizedQuery = query.toLocaleLowerCase()

  if (!normalizedQuery) {
    return config.groups
  }

  return config.groups.flatMap((group) => {
    const commands = group.commands.filter((command) => {
      return [command.label, command.key, ...command.keywords].some((term) =>
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

export function canRunRichTextSlashCommand(
  editor: Editor,
  command: RichTextSlashCommand,
  queryRange: Range,
) {
  const anchor = resolveSlashCommandAnchor(editor, queryRange)

  if (anchor === undefined) {
    return false
  }

  if (command.type === 'ui') {
    return command.isEnabled?.({ editor, anchor }) ?? true
  }

  return editor
    .can()
    .chain()
    .deleteRange(queryRange)
    .command(({ tr, dispatch }) => {
      if (!dispatch) {
        tr.delete(queryRange.from, queryRange.to)
      }

      return true
    })
    .command(command.item.action.command())
    .run()
}

export function runRichTextSlashCommand(
  editor: Editor,
  command: RichTextSlashCommand,
  queryRange: Range,
) {
  if (!canRunRichTextSlashCommand(editor, command, queryRange)) {
    return false
  }

  if (command.type === 'action') {
    const actionCommand = command.item.action.command()

    return editor
      .chain()
      .focus()
      .command(({ tr }) => {
        closeHistory(tr)
        return true
      })
      .deleteRange(queryRange)
      .command((props) => {
        const handled = actionCommand(props)

        if (!handled) {
          props.tr.setMeta('preventDispatch', true)
        }

        return handled
      })
      .run()
  }

  const expectedAnchor = resolveSlashCommandAnchor(editor, queryRange)

  if (
    expectedAnchor === undefined ||
    !editor
      .chain()
      .focus()
      .command(({ tr }) => {
        closeHistory(tr)
        return true
      })
      .deleteRange(queryRange)
      .run()
  ) {
    return false
  }

  return command.run({ editor, anchor: expectedAnchor })
}
