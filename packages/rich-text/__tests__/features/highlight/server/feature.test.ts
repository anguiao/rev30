import { describe, expect, it } from 'vitest'
import { highlightColorOptions } from '../../../../src/features/highlight/core/colors'
import { highlightHtmlPolicy } from '../../../../src/features/highlight/server/feature'
import { sanitizeRichTextHtml } from '../../../../src/server/sanitize'

const yellow = highlightColorOptions[0]

describe('highlight html policy', () => {
  it('keeps palette highlight styles', () => {
    const sanitized = sanitizeRichTextHtml(
      `<p><mark data-color="${yellow.value}" style="background-color: ${yellow.value}; color: inherit">维护通知</mark></p>`,
      [highlightHtmlPolicy],
    )

    expect(sanitized).toBe(
      `<mark data-color="${yellow.value}" style="background-color:${yellow.value};color:inherit">维护通知</mark>`,
    )
  })

  it('downgrades unknown highlight colors to plain mark', () => {
    expect(
      sanitizeRichTextHtml(
        '<mark data-color="#000000" style="background-color: #000000; color: inherit">维护通知</mark>',
        [highlightHtmlPolicy],
      ),
    ).toBe('<mark>维护通知</mark>')
  })

  it('does not fall back to styles when data-color is present but unsupported', () => {
    expect(
      sanitizeRichTextHtml(
        `<mark data-color="#000000" style="background-color: ${yellow.value}">维护通知</mark>`,
        [highlightHtmlPolicy],
      ),
    ).toBe('<mark>维护通知</mark>')
  })

  it('removes non-highlight inline styles from mark', () => {
    const sanitized = sanitizeRichTextHtml(
      `<mark data-color="${yellow.value}" style="background-color: ${yellow.value}; position: fixed; inset: 0">维护通知</mark>`,
      [highlightHtmlPolicy],
    )

    expect(sanitized).toBe(
      `<mark data-color="${yellow.value}" style="background-color:${yellow.value};color:inherit">维护通知</mark>`,
    )
  })
})
