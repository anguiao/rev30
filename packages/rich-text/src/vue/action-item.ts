import type { RichTextFeature } from '../core/feature'
import type { RichTextAction } from '../editor/action'

export type RichTextIconClass = `i-[${string}--${string}]`

export type RichTextActionItemAction = RichTextAction<RichTextFeature, string, []>

export interface RichTextActionItem<
  Action extends RichTextActionItemAction = RichTextActionItemAction,
> {
  readonly action: Action
  readonly label: string
  readonly icon: RichTextIconClass
}

export function defineRichTextActionItem<const Action extends RichTextActionItemAction>(
  action: Action,
  item: Omit<RichTextActionItem<Action>, 'action'>,
): RichTextActionItem<Action> {
  return Object.freeze({
    action,
    ...item,
  })
}
