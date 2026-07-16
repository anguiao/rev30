import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import type { TextStyleOption } from './options'
import { textStyleFeature } from './shared'

export const setTextColorAction = defineRichTextAction(textStyleFeature, {
  key: 'set-text-color',
  run: (editor, color: TextStyleOption['value']) => editor.chain().focus().setColor(color).run(),
  canRun: (editor, color: TextStyleOption['value']) =>
    editor.can().chain().focus().setColor(color).run(),
})

export const unsetTextColorAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-text-color',
  run: (editor) => editor.chain().focus().unsetColor().run(),
  canRun: (editor) => editor.can().chain().focus().unsetColor().run(),
})

export const setFontFamilyAction = defineRichTextAction(textStyleFeature, {
  key: 'set-font-family',
  run: (editor, fontFamily: TextStyleOption['value']) =>
    editor.chain().focus().setFontFamily(fontFamily).run(),
  canRun: (editor, fontFamily: TextStyleOption['value']) =>
    editor.can().chain().focus().setFontFamily(fontFamily).run(),
})

export const unsetFontFamilyAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-font-family',
  run: (editor) => editor.chain().focus().unsetFontFamily().run(),
  canRun: (editor) => editor.can().chain().focus().unsetFontFamily().run(),
})

export const setFontSizeAction = defineRichTextAction(textStyleFeature, {
  key: 'set-font-size',
  run: (editor, fontSize: TextStyleOption['value']) =>
    editor.chain().focus().setFontSize(fontSize).run(),
  canRun: (editor, fontSize: TextStyleOption['value']) =>
    editor.can().chain().focus().setFontSize(fontSize).run(),
})

export const unsetFontSizeAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-font-size',
  run: (editor) => editor.chain().focus().unsetFontSize().run(),
  canRun: (editor) => editor.can().chain().focus().unsetFontSize().run(),
})

export const setLineHeightAction = defineRichTextAction(textStyleFeature, {
  key: 'set-line-height',
  run: (editor, lineHeight: TextStyleOption['value']) =>
    editor.chain().focus().setLineHeight(lineHeight).run(),
  canRun: (editor, lineHeight: TextStyleOption['value']) =>
    editor.can().chain().focus().setLineHeight(lineHeight).run(),
})

export const unsetLineHeightAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-line-height',
  run: (editor) => editor.chain().focus().unsetLineHeight().run(),
  canRun: (editor) => editor.can().chain().focus().unsetLineHeight().run(),
})

export const textStyleEditorFeature = defineRichTextEditorFeature(textStyleFeature, {})
