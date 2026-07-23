import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/sanitize'
import { fontFamilySet, fontSizeSet, lineHeightSet, textColorSet } from './options'
import { textStyleFeature } from './shared'

const textStyleProperties = ['color', 'font-family', 'font-size', 'line-height'] as const

type TextStyleProperty = (typeof textStyleProperties)[number]

function normalizeStyleValue(property: TextStyleProperty, value: string) {
  const normalized = value.trim().toLowerCase()

  if (property === 'color') {
    return textColorSet.has(normalized) ? normalized : undefined
  }

  if (property === 'font-family') {
    return fontFamilySet.has(normalized) ? normalized : undefined
  }

  if (property === 'font-size') {
    return fontSizeSet.has(normalized) ? normalized : undefined
  }

  return lineHeightSet.has(normalized) ? normalized : undefined
}

function parseTextStyle(style: string | undefined) {
  const values = new Map<TextStyleProperty, string>()

  for (const declaration of style?.split(';') ?? []) {
    const separator = declaration.indexOf(':')

    if (separator < 0) {
      continue
    }

    const property = declaration.slice(0, separator).trim().toLowerCase()

    if (!textStyleProperties.includes(property as TextStyleProperty)) {
      continue
    }

    const textStyleProperty = property as TextStyleProperty
    const value = normalizeStyleValue(textStyleProperty, declaration.slice(separator + 1))

    if (value) {
      values.set(textStyleProperty, value)
    } else {
      values.delete(textStyleProperty)
    }
  }

  return values
}

function buildTextStyle(values: ReadonlyMap<TextStyleProperty, string>) {
  return textStyleProperties
    .flatMap((property) => {
      const value = values.get(property)

      return value ? [`${property}: ${value}`] : []
    })
    .join('; ')
}

const transformTextStyle: RichTextTagTransform = ({ tagName, attribs }) => {
  const style = buildTextStyle(parseTextStyle(attribs.style))

  return {
    tagName,
    attribs: style ? { style } : {},
  }
}

export const textStyleHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['span'],
  allowedAttributes: {
    span: ['style'],
  },
  allowedStyles: {
    span: Object.fromEntries(textStyleProperties.map((property) => [property, [/^.+$/]])),
  },
  transformTags: {
    span: [transformTextStyle],
  },
}

export const textStyleServerFeature = defineRichTextServerFeature(textStyleFeature, {
  htmlPolicy: textStyleHtmlPolicy,
})
