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
    ).toBe(
      '<pre class="rich-text-code-block" style="background-color:light-dark(#f5f5f4, #09090b)"><code class="language-typescript">const ready = true</code></pre>',
    )
  })

  it('keeps punctuation in valid language classes', () => {
    expect(
      sanitizeRichTextHtml('<pre><code class="language-c++">const ready = true</code></pre>', [
        codeBlockHtmlPolicy,
      ]),
    ).toBe(
      '<pre class="rich-text-code-block" style="background-color:light-dark(#f5f5f4, #09090b)"><code class="language-c++">const ready = true</code></pre>',
    )

    expect(
      sanitizeRichTextHtml('<pre><code class="language-c#">const ready = true</code></pre>', [
        codeBlockHtmlPolicy,
      ]),
    ).toBe(
      '<pre class="rich-text-code-block" style="background-color:light-dark(#f5f5f4, #09090b)"><code class="language-c#">const ready = true</code></pre>',
    )
  })
})
