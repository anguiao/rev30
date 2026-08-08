import { Extension, type Editor } from '@tiptap/core'
import type { Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'

export interface RichTextPasteRule {
  readonly transformHTML?: (html: string, editor: Editor) => string
  readonly handlePaste?: (context: {
    editor: Editor
    event: ClipboardEvent
    slice: Slice
  }) => boolean
}

export function createRichTextPasteExtension(rules: readonly RichTextPasteRule[]) {
  return Extension.create({
    name: 'richTextPasteRules',

    transformPastedHTML(html) {
      return rules.reduce(
        (transformedHtml, rule) =>
          rule.transformHTML ? rule.transformHTML(transformedHtml, this.editor) : transformedHtml,
        html,
      )
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handlePaste: (_view, event, slice) => {
              for (const rule of rules) {
                if (rule.handlePaste?.({ editor: this.editor, event, slice })) {
                  return true
                }
              }

              return false
            },
          },
        }),
      ]
    },
  })
}
