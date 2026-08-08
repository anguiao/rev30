import type { Attributes } from '@tiptap/core'
import BulletList from '@tiptap/extension-bullet-list'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import { defineRichTextFeature } from '../../../core/feature'
import { normalizeOrderedListStart, normalizeOrderedListType } from './attrs'

function validateOrderedListStart(value: unknown) {
  if (typeof value !== 'number' || normalizeOrderedListStart(value) === null) {
    throw new RangeError('Ordered list start must be a safe integer')
  }
}

function validateOrderedListType(value: unknown) {
  if (value !== null && normalizeOrderedListType(value) === null) {
    throw new RangeError('Unsupported ordered list type')
  }
}

const RichTextOrderedList = OrderedList.extend({
  addAttributes() {
    const parentAttributes: Attributes = this.parent?.() ?? {}

    return {
      ...parentAttributes,
      start: {
        ...parentAttributes.start,
        parseHTML: (element) => normalizeOrderedListStart(element.getAttribute('start')) ?? 1,
        validate: validateOrderedListStart,
      },
      type: {
        ...parentAttributes.type,
        parseHTML: (element) =>
          normalizeOrderedListType(parentAttributes.type?.parseHTML?.(element)),
        validate: validateOrderedListType,
      },
    }
  },
})

export const listFeature = defineRichTextFeature({
  key: 'list',
  editorImplementation: true,
  serverImplementation: true,
  sharedExtensions: () => [BulletList, RichTextOrderedList, ListItem],
})
