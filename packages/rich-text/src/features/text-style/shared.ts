import { getStyleProperty } from '@tiptap/core'
import { Color } from '@tiptap/extension-text-style/color'
import { FontFamily } from '@tiptap/extension-text-style/font-family'
import { FontSize } from '@tiptap/extension-text-style/font-size'
import { LineHeight } from '@tiptap/extension-text-style/line-height'
import { TextStyle } from '@tiptap/extension-text-style/text-style'
import { defineRichTextFeature } from '../../core/feature'
import { baseFeature } from '../base/shared'
import { fontFamilies, fontSizes, lineHeights, textColors } from './options'

type TextStyleElement = Parameters<typeof getStyleProperty>[0]

function validateTextStyleAttribute(
  value: unknown,
  supportedValues: ReadonlySet<string>,
  attribute: string,
) {
  if (value !== null && (typeof value !== 'string' || !supportedValues.has(value))) {
    throw new RangeError(`Unsupported text style ${attribute}`)
  }
}

function normalizeTextStyleAttribute(
  value: string | undefined,
  supportedValues: ReadonlySet<string>,
) {
  const normalized = value?.trim().toLowerCase()

  return normalized && supportedValues.has(normalized) ? normalized : null
}

const textColorSet = new Set<string>(textColors)
const fontFamilySet = new Set<string>(fontFamilies)
const fontSizeSet = new Set<string>(fontSizes)
const lineHeightSet = new Set<string>(lineHeights)

function hasSupportedTextStyle(element: TextStyleElement) {
  return [
    normalizeTextStyleAttribute(
      getStyleProperty(element, 'color') ?? element.style.color,
      textColorSet,
    ),
    normalizeTextStyleAttribute(
      getStyleProperty(element, 'font-family') ?? element.style.fontFamily,
      fontFamilySet,
    ),
    normalizeTextStyleAttribute(
      getStyleProperty(element, 'font-size') ?? element.style.fontSize,
      fontSizeSet,
    ),
    normalizeTextStyleAttribute(
      getStyleProperty(element, 'line-height') ?? element.style.lineHeight,
      lineHeightSet,
    ),
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
          parseHTML: (element) =>
            normalizeTextStyleAttribute(
              getStyleProperty(element, 'color') ?? element.style.color,
              textColorSet,
            ),
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
            normalizeTextStyleAttribute(
              getStyleProperty(element, 'font-family') ?? element.style.fontFamily,
              fontFamilySet,
            ),
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
            normalizeTextStyleAttribute(
              getStyleProperty(element, 'font-size') ?? element.style.fontSize,
              fontSizeSet,
            ),
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
            normalizeTextStyleAttribute(
              getStyleProperty(element, 'line-height') ?? element.style.lineHeight,
              lineHeightSet,
            ),
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
  dependencies: [baseFeature],
  documentExtensions: () => [
    RichTextTextStyle,
    RichTextColor,
    RichTextFontFamily,
    RichTextFontSize,
    RichTextLineHeight,
  ],
})
