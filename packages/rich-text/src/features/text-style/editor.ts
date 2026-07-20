import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import type { TextStyleOption } from './options'
import { textStyleFeature } from './shared'

export const setTextColorAction = defineRichTextAction(textStyleFeature, {
  key: 'set-text-color',
  command:
    (color: TextStyleOption['value']) =>
    ({ chain }) =>
      chain().focus().setColor(color).run(),
})

export const unsetTextColorAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-text-color',
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetColor().run(),
})

export const setFontFamilyAction = defineRichTextAction(textStyleFeature, {
  key: 'set-font-family',
  command:
    (fontFamily: TextStyleOption['value']) =>
    ({ chain }) =>
      chain().focus().setFontFamily(fontFamily).run(),
})

export const unsetFontFamilyAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-font-family',
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetFontFamily().run(),
})

export const setFontSizeAction = defineRichTextAction(textStyleFeature, {
  key: 'set-font-size',
  command:
    (fontSize: TextStyleOption['value']) =>
    ({ chain }) =>
      chain().focus().setFontSize(fontSize).run(),
})

export const unsetFontSizeAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-font-size',
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetFontSize().run(),
})

export const setLineHeightAction = defineRichTextAction(textStyleFeature, {
  key: 'set-line-height',
  command:
    (lineHeight: TextStyleOption['value']) =>
    ({ chain }) =>
      chain().focus().setLineHeight(lineHeight).run(),
})

export const unsetLineHeightAction = defineRichTextAction(textStyleFeature, {
  key: 'unset-line-height',
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetLineHeight().run(),
})

export const textStyleEditorFeature = defineRichTextEditorFeature(textStyleFeature, {})
