import type { AnyExtension } from '@tiptap/core'

export type RichTextIconClass = `i-[${string}--${string}]`
export type RichTextExtension = AnyExtension | AnyExtension[]

export interface RichTextFeature {
  key: string
  label: string
  icon?: RichTextIconClass
  extension: () => RichTextExtension
}

export function defineRichTextFeature(feature: RichTextFeature): RichTextFeature {
  return feature
}
