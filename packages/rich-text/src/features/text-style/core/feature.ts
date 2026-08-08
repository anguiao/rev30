import { Color } from '@tiptap/extension-text-style/color'
import { FontFamily } from '@tiptap/extension-text-style/font-family'
import { FontSize } from '@tiptap/extension-text-style/font-size'
import { LineHeight } from '@tiptap/extension-text-style/line-height'
import { TextStyle } from '@tiptap/extension-text-style/text-style'
import type { TagParseRule } from '@tiptap/pm/model'
import { defineRichTextFeature } from '../../../core/feature'
import { fontFamilySet, fontSizeSet, lineHeightSet, textColorSet } from './options'

function validateTextStyleAttribute(
  value: unknown,
  supportedValues: ReadonlySet<string>,
  attribute: string,
) {
  if (value !== null && (typeof value !== 'string' || !supportedValues.has(value))) {
    throw new RangeError(`Unsupported text style ${attribute}`)
  }
}

function getSupportedStyleProperty(
  style: string | null,
  property: string,
  supportedValues: ReadonlySet<string>,
) {
  const declarations = style?.split(';') ?? []

  for (let index = declarations.length - 1; index >= 0; index -= 1) {
    const declaration = declarations[index]!
    const separator = declaration.indexOf(':')

    if (separator < 0 || declaration.slice(0, separator).trim().toLowerCase() !== property) {
      continue
    }

    const value = declaration
      .slice(separator + 1)
      .trim()
      .toLowerCase()

    if (supportedValues.has(value)) {
      return value
    }
  }

  return null
}

function hasSupportedTextStyle(style: string | null) {
  return [
    getSupportedStyleProperty(style, 'color', textColorSet),
    getSupportedStyleProperty(style, 'font-family', fontFamilySet),
    getSupportedStyleProperty(style, 'font-size', fontSizeSet),
    getSupportedStyleProperty(style, 'line-height', lineHeightSet),
  ].some((value) => value !== null)
}

const RichTextTextStyle = TextStyle.extend({
  parseHTML() {
    return (this.parent?.() ?? []).flatMap((rule) => {
      if (!rule.tag) {
        return []
      }

      const getAttrs = rule.getAttrs

      return [
        {
          ...rule,
          getAttrs: (element) => {
            const attributes = getAttrs ? getAttrs(element) : null

            if (attributes === false) {
              return false
            }

            return hasSupportedTextStyle(element.getAttribute('style')) ? attributes : false
          },
        } satisfies TagParseRule,
      ]
    })
  },
})

const RichTextColor = Color.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((attributeGroup) => ({
      ...attributeGroup,
      attributes: {
        ...attributeGroup.attributes,
        color: {
          ...attributeGroup.attributes.color,
          parseHTML: (element) =>
            getSupportedStyleProperty(element.getAttribute('style'), 'color', textColorSet),
          validate: (value: unknown) => validateTextStyleAttribute(value, textColorSet, 'color'),
        },
      },
    }))
  },
})

const RichTextFontFamily = FontFamily.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((attributeGroup) => ({
      ...attributeGroup,
      attributes: {
        ...attributeGroup.attributes,
        fontFamily: {
          ...attributeGroup.attributes.fontFamily,
          parseHTML: (element) =>
            getSupportedStyleProperty(element.getAttribute('style'), 'font-family', fontFamilySet),
          validate: (value: unknown) =>
            validateTextStyleAttribute(value, fontFamilySet, 'font family'),
        },
      },
    }))
  },
})

const RichTextFontSize = FontSize.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((attributeGroup) => ({
      ...attributeGroup,
      attributes: {
        ...attributeGroup.attributes,
        fontSize: {
          ...attributeGroup.attributes.fontSize,
          parseHTML: (element) =>
            getSupportedStyleProperty(element.getAttribute('style'), 'font-size', fontSizeSet),
          validate: (value: unknown) => validateTextStyleAttribute(value, fontSizeSet, 'font size'),
        },
      },
    }))
  },
})

const RichTextLineHeight = LineHeight.extend({
  addGlobalAttributes() {
    return (this.parent?.() ?? []).map((attributeGroup) => ({
      ...attributeGroup,
      attributes: {
        ...attributeGroup.attributes,
        lineHeight: {
          ...attributeGroup.attributes.lineHeight,
          parseHTML: (element) =>
            getSupportedStyleProperty(element.getAttribute('style'), 'line-height', lineHeightSet),
          validate: (value: unknown) =>
            validateTextStyleAttribute(value, lineHeightSet, 'line height'),
        },
      },
    }))
  },
})

export const textStyleFeature = defineRichTextFeature({
  key: 'text-style',
  editorImplementation: true,
  serverImplementation: true,
  sharedExtensions: () => [
    RichTextTextStyle,
    RichTextColor,
    RichTextFontFamily,
    RichTextFontSize,
    RichTextLineHeight,
  ],
})
