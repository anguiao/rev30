import type { Command, Editor } from '@tiptap/core'
import type { RichTextFeature } from '../core/feature'

export type RichTextIconClass = `i-[${string}--${string}]`

export interface RichTextAction<
  Feature extends RichTextFeature = RichTextFeature,
  Key extends string = string,
  Arguments extends unknown[] = [],
> {
  readonly feature: Feature
  readonly key: Key
  readonly command: (...arguments_: Arguments) => Command
  readonly isActive?: (editor: Editor, ...arguments_: Arguments) => boolean
}

export interface RichTextActionItem<
  Feature extends RichTextFeature = RichTextFeature,
  Key extends string = string,
  Arguments extends unknown[] = [],
> {
  readonly action: RichTextAction<Feature, Key, Arguments>
  readonly label: string
  readonly icon: RichTextIconClass
  readonly keywords: readonly string[]
}

type RichTextActionDefinition<Key extends string, Arguments extends unknown[]> = Omit<
  RichTextAction<RichTextFeature, Key, Arguments>,
  'feature'
>

export function defineRichTextAction<
  const Feature extends RichTextFeature,
  const Key extends string,
  Arguments extends unknown[] = [],
>(
  feature: Feature,
  action: RichTextActionDefinition<Key, Arguments>,
): RichTextAction<Feature, Key, Arguments> {
  return {
    feature,
    ...action,
  }
}

export function defineRichTextActionItem<
  const Feature extends RichTextFeature,
  const Key extends string,
  Arguments extends unknown[],
>(
  action: RichTextAction<Feature, Key, Arguments>,
  item: Omit<RichTextActionItem<Feature, Key, Arguments>, 'action' | 'keywords'> & {
    readonly keywords?: readonly string[]
  },
): RichTextActionItem<Feature, Key, Arguments> {
  return {
    action,
    ...item,
    keywords: item.keywords ?? [],
  }
}

export function runRichTextAction<
  Feature extends RichTextFeature,
  Key extends string,
  Arguments extends unknown[],
>(editor: Editor, action: RichTextAction<Feature, Key, Arguments>, ...arguments_: Arguments) {
  return editor.commands.command(action.command(...arguments_))
}

export function canRunRichTextAction<
  Feature extends RichTextFeature,
  Key extends string,
  Arguments extends unknown[],
>(editor: Editor, action: RichTextAction<Feature, Key, Arguments>, ...arguments_: Arguments) {
  return editor.can().command(action.command(...arguments_))
}
