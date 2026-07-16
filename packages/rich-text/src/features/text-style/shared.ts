import type { Attribute } from '@tiptap/core'
import { Color } from '@tiptap/extension-text-style/color'
import { FontFamily } from '@tiptap/extension-text-style/font-family'
import { FontSize } from '@tiptap/extension-text-style/font-size'
import { LineHeight } from '@tiptap/extension-text-style/line-height'
import { TextStyle } from '@tiptap/extension-text-style/text-style'
import { defineRichTextFeature } from '../../core/feature'
import { fontFamilySet, fontSizeSet, lineHeightSet, textColorSet } from './options'

type TextStyleElement = Parameters<NonNullable<Attribute['parseHTML']>>[0]

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
  element: TextStyleElement,
  property: string,
  supportedValues: ReadonlySet<string>,
) {
  const declarations = element.getAttribute('style')?.split(';') ?? []

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

function hasSupportedTextStyle(element: TextStyleElement) {
  return [
    getSupportedStyleProperty(element, 'color', textColorSet),
    getSupportedStyleProperty(element, 'font-family', fontFamilySet),
    getSupportedStyleProperty(element, 'font-size', fontSizeSet),
    getSupportedStyleProperty(element, 'line-height', lineHeightSet),
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
          getAttrs: (element: TextStyleElement) => {
            const attributes = getAttrs ? getAttrs(element) : null

            if (attributes === false) {
              return false
            }

            return hasSupportedTextStyle(element) ? attributes : false
          },
        },
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
          parseHTML: (element) => getSupportedStyleProperty(element, 'color', textColorSet),
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
          parseHTML: (element) => getSupportedStyleProperty(element, 'font-family', fontFamilySet),
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
          parseHTML: (element) => getSupportedStyleProperty(element, 'font-size', fontSizeSet),
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
          parseHTML: (element) => getSupportedStyleProperty(element, 'line-height', lineHeightSet),
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
  documentExtensions: () => [
    RichTextTextStyle,
    RichTextColor,
    RichTextFontFamily,
    RichTextFontSize,
    RichTextLineHeight,
  ],
})
