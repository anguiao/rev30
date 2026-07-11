import { describe, expect, it } from 'vitest'
import { codeBlockHtmlPolicy } from '../../../src/features/code-block/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

describe('code block html policy', () => {
  it('keeps supported language metadata while removing unsupported attributes', () => {
    expect(
      sanitizeRichTextHtml(
        '<pre class="code-block"><code class="language-typescript" data-x="1">const ready = true</code></pre>',
        [codeBlockHtmlPolicy],
      ),
    ).toBe('<pre><code class="language-typescript">const ready = true</code></pre>')
  })

  it('normalizes aliases and removes unsupported language classes', () => {
    expect(
      sanitizeRichTextHtml('<pre><code class="hljs language-ts">const ready = true</code></pre>', [
        codeBlockHtmlPolicy,
      ]),
    ).toBe('<pre><code class="language-typescript">const ready = true</code></pre>')

    expect(
      sanitizeRichTextHtml('<pre><code class="language-unknown">const ready = true</code></pre>', [
        codeBlockHtmlPolicy,
      ]),
    ).toBe('<pre><code>const ready = true</code></pre>')
  })
})
