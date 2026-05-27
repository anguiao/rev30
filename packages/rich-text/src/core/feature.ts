import type { AnyExtension } from '@tiptap/core'

export type RichTextExtension = AnyExtension | AnyExtension[]

export interface RichTextFeature {
  key: string
  extension: () => RichTextExtension
}

export function defineRichTextFeature(feature: RichTextFeature): RichTextFeature {
  return feature
}
