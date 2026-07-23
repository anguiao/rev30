import { defineRichTextAction, defineRichTextActionItem } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { headingFeature } from './shared'

export const headingActions = [
  defineRichTextAction(headingFeature, {
    key: 'heading-1',
    command:
      () =>
      ({ chain }) =>
        chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
  }),
  defineRichTextAction(headingFeature, {
    key: 'heading-2',
    command:
      () =>
      ({ chain }) =>
        chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  }),
  defineRichTextAction(headingFeature, {
    key: 'heading-3',
    command:
      () =>
      ({ chain }) =>
        chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  }),
] as const

export const headingActionItems = [
  defineRichTextActionItem(headingActions[0], {
    label: '一级标题',
    icon: 'i-[lucide--heading-1]',
    keywords: ['标题1', 'h1', 'heading1'],
  }),
  defineRichTextActionItem(headingActions[1], {
    label: '二级标题',
    icon: 'i-[lucide--heading-2]',
    keywords: ['标题2', 'h2', 'heading2'],
  }),
  defineRichTextActionItem(headingActions[2], {
    label: '三级标题',
    icon: 'i-[lucide--heading-3]',
    keywords: ['标题3', 'h3', 'heading3'],
  }),
] as const

export const headingEditorFeature = defineRichTextEditorFeature(headingFeature, {})
