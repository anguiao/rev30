import { describe, expect, it } from 'vitest'
import { textStyleHtmlPolicy } from '../../../src/features/text-style/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

describe('text style html policy', () => {
  it('normalizes supported styles in a stable order', () => {
    expect(
      sanitizeRichTextHtml(
        '<span class="notice" data-id="1" style="LINE-HEIGHT: 1.5; FONT-SIZE: 14PT; FONT-FAMILY: SERIF; COLOR: #EF4444">维护通知</span>',
        [textStyleHtmlPolicy],
      ),
    ).toBe(
      '<span style="color:#ef4444;font-family:serif;font-size:14pt;line-height:1.5">维护通知</span>',
    )
  })

  it('keeps supported declarations while removing unrelated styles and attributes', () => {
    expect(
      sanitizeRichTextHtml(
        '<span id="notice" title="通知" style="position: fixed; color: #3b82f6; inset: 0; font-size: 18pt">维护通知</span>',
        [textStyleHtmlPolicy],
      ),
    ).toBe('<span style="color:#3b82f6;font-size:18pt">维护通知</span>')
  })

  it('removes unsupported and dangerous style values', () => {
    expect(
      sanitizeRichTextHtml(
        '<span style="color: red; font-family: Arial; font-size: 16px; line-height: calc(1 + 1)">维护通知</span>',
        [textStyleHtmlPolicy],
      ),
    ).toBe('<span>维护通知</span>')

    expect(
      sanitizeRichTextHtml(
        '<span style="color: #ef4444; color: var(--notice-color); font-size: 14pt; line-height: 1.5 !important; background: url(https://example.com/a.png)">维护通知</span>',
        [textStyleHtmlPolicy],
      ),
    ).toBe('<span style="font-size:14pt">维护通知</span>')
  })
})
