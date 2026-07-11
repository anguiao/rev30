import type { Editor } from '@tiptap/core'
import type { RichTextFeature } from '../core/feature'

export interface RichTextAction<
  Feature extends RichTextFeature = RichTextFeature,
  Key extends string = string,
  Arguments extends unknown[] = [],
> {
  readonly feature: Feature
  readonly key: Key
  readonly run: (editor: Editor, ...arguments_: Arguments) => boolean
  readonly isActive?: (editor: Editor, ...arguments_: Arguments) => boolean
  readonly canRun?: (editor: Editor, ...arguments_: Arguments) => boolean
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
  return Object.freeze({
    feature,
    ...action,
  })
}
