import { describe, expect, it } from 'vitest'
import { strikeHtmlPolicy } from '../../../src/features/strike/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

describe('strike html policy', () => {
  it('keeps strike text and removes unsafe attributes', () => {
    expect(
      sanitizeRichTextHtml('<s style="position: fixed" data-x="1">维护通知</s>', [
        strikeHtmlPolicy,
      ]),
    ).toBe('<s>维护通知</s>')
  })
})
