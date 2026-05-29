import { describe, expect, it } from 'vitest'
import { highlightColorOptions } from '../../../src/features/highlight/colors'
import { highlightHtmlPolicy } from '../../../src/features/highlight/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

const yellow = highlightColorOptions[0]

function getMarkAttributes(html: string) {
  const match = /^<mark(?<attributes>(?:\s+[^>]+)?)>维护通知<\/mark>$/.exec(html)

  expect(match).not.toBeNull()

  const attributesSource = match?.groups?.attributes ?? ''

  return Object.fromEntries(
    [...attributesSource.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
  )
}

function parseStyleAttribute(style: string | undefined) {
  const declarations: Record<string, string> = {}

  for (const declaration of (style ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const [property, ...value] = declaration.split(':')

    if (!property || value.length === 0) {
      continue
    }

    declarations[property.trim()] = value.join(':').trim()
  }

  return declarations
}

describe('highlight html policy', () => {
  it('keeps palette highlight styles', () => {
    const sanitized = sanitizeRichTextHtml(
      `<p><mark data-color="${yellow.value}" style="background-color: ${yellow.value}; color: inherit">维护通知</mark></p>`,
      [highlightHtmlPolicy],
    )

    expect(sanitized).not.toContain('<p>')

    const attributes = getMarkAttributes(sanitized)

    expect(attributes['data-color']).toBe(yellow.value)
    expect(parseStyleAttribute(attributes.style)).toEqual({
      'background-color': yellow.value,
      color: 'inherit',
    })
  })

  it('downgrades unknown highlight colors to plain mark', () => {
    expect(
      sanitizeRichTextHtml(
        '<mark data-color="#000000" style="background-color: #000000; color: inherit">维护通知</mark>',
        [highlightHtmlPolicy],
      ),
    ).toBe('<mark>维护通知</mark>')
  })

  it('removes non-highlight inline styles from mark', () => {
    const sanitized = sanitizeRichTextHtml(
      `<mark data-color="${yellow.value}" style="background-color: ${yellow.value}; position: fixed; inset: 0">维护通知</mark>`,
      [highlightHtmlPolicy],
    )

    const attributes = getMarkAttributes(sanitized)

    expect(attributes['data-color']).toBe(yellow.value)
    expect(parseStyleAttribute(attributes.style)).toEqual({
      'background-color': yellow.value,
      color: 'inherit',
    })
    expect(sanitized).not.toContain('position')
    expect(sanitized).not.toContain('inset')
  })
})
