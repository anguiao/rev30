import type { Command, Editor, Range } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { RichTextFeature } from '../../../core/feature'
import type { RichTextActionItem, RichTextIconClass } from '../../../client/editor/action'

export interface RichTextSlashCommand {
  readonly feature: RichTextFeature
  readonly key: string
  readonly label: string
  readonly icon: RichTextIconClass
  readonly keywords: readonly string[]
  readonly command: Command
}

export interface RichTextSlashMenuGroup {
  readonly key: string
  readonly label: string
  readonly commands: readonly RichTextSlashCommand[]
}

export function richTextSlashCommand(item: RichTextActionItem): RichTextSlashCommand
export function richTextSlashCommand<Arguments extends unknown[]>(
  item: RichTextActionItem<RichTextFeature, string, Arguments>,
  run: (editor: Editor) => void,
): RichTextSlashCommand
export function richTextSlashCommand(
  item: RichTextActionItem,
  run?: (editor: Editor) => void,
): RichTextSlashCommand {
  return {
    feature: item.action.feature,
    key: item.action.key,
    label: item.label,
    icon: item.icon,
    keywords: item.keywords,
    command: run
      ? ({ editor, dispatch }) => {
          if (dispatch) {
            run(editor)
          }

          return true
        }
      : (props) => item.action.command(props),
  }
}

export function defineRichTextSlashMenu(groups: readonly RichTextSlashMenuGroup[]) {
  const groupKeys = new Set<string>()
  const commandKeys = new Set<string>()

  for (const group of groups) {
    if (groupKeys.has(group.key)) {
      throw new Error(`Rich text slash menu has a duplicate group: "${group.key}"`)
    }

    groupKeys.add(group.key)

    for (const command of group.commands) {
      if (commandKeys.has(command.key)) {
        throw new Error(`Rich text slash menu has a duplicate command: "${command.key}"`)
      }

      commandKeys.add(command.key)
    }
  }

  return groups
}

export function filterRichTextSlashMenu(groups: readonly RichTextSlashMenuGroup[], query: string) {
  const normalizedQuery = query.toLocaleLowerCase()

  if (!normalizedQuery) {
    return groups
  }

  return groups.flatMap((group) => {
    const commands = group.commands.filter((command) => {
      return [command.label, command.key, ...command.keywords].some((term) =>
        term.toLocaleLowerCase().includes(normalizedQuery),
      )
    })

    return commands.length
      ? [
          {
            ...group,
            commands,
          },
        ]
      : []
  })
}

export function canRunRichTextSlashCommand(
  editor: Editor,
  command: RichTextSlashCommand,
  queryRange: Range,
) {
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
    .command(command.command)
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

  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      closeHistory(tr)
      return true
    })
    .deleteRange(queryRange)
    .command((props) => {
      const handled = command.command(props)

      if (!handled) {
        props.tr.setMeta('preventDispatch', true)
      }

      return handled
    })
    .run()
}
