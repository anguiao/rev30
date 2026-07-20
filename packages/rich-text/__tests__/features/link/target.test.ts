import Bold from '@tiptap/extension-bold'
import CodeBlock from '@tiptap/extension-code-block'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { linkFeature } from '../../../src/features/link/shared'
import { resolveRichTextLinkTarget } from '../../../src/features/link/target'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string) {
  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      CodeBlock,
      HardBreak,
      ...linkFeature.documentExtensions!(),
    ],
    content,
  })
}

describe('rich text link target resolver', () => {
  it('resolves the unique continuous link beside a collapsed caret', () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>普通文字</p>')

    for (const position of [1, 3, 5]) {
      editor.commands.setTextSelection(position)

      expect(resolveRichTextLinkTarget(editor, 'quickbar')).toMatchObject({
        mode: 'edit',
        range: { from: 1, to: 5 },
        href: 'https://example.com',
        hasLinkMarks: true,
        selection: { from: position, to: position, empty: true },
      })
    }
  })

  it('keeps a continuous link range across other inline marks', () => {
    const editor = createEditor(
      '<p><a href="https://example.com">链<strong>接</strong>文本</a></p>',
    )
    editor.commands.setTextSelection(3)

    expect(resolveRichTextLinkTarget(editor, 'quickbar')).toMatchObject({
      mode: 'edit',
      range: { from: 1, to: 5 },
      href: 'https://example.com',
    })
  })

  it('does not guess between adjacent links with different href values', () => {
    const editor = createEditor(
      '<p><a href="https://first.example">甲</a><a href="https://second.example">乙</a></p>',
    )
    editor.commands.setTextSelection(2)

    expect(resolveRichTextLinkTarget(editor, 'quickbar')).toBeNull()
    expect(resolveRichTextLinkTarget(editor, 'toolbar')).toMatchObject({
      mode: 'stored',
      range: { from: 2, to: 2 },
      href: '',
      hasLinkMarks: false,
    })
  })

  it('edits the complete link range for a non-empty selection inside one link', () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>普通文字</p>')
    editor.commands.setTextSelection({ from: 2, to: 4 })

    expect(resolveRichTextLinkTarget(editor, 'text-quickbar')).toMatchObject({
      mode: 'edit',
      range: { from: 1, to: 5 },
      href: 'https://example.com',
      hasLinkMarks: true,
      selection: { from: 2, to: 4, empty: false },
    })
    expect(resolveRichTextLinkTarget(editor, 'quickbar')).toBeNull()
  })

  it('keeps exact ranges for plain and mixed single-block selections', () => {
    const editor = createEditor('<p><a href="https://example.com">链接</a>普通文字</p>')

    editor.commands.setTextSelection({ from: 3, to: 7 })
    expect(resolveRichTextLinkTarget(editor, 'text-quickbar')).toMatchObject({
      mode: 'create',
      range: { from: 3, to: 7 },
      href: '',
      hasLinkMarks: false,
    })

    editor.commands.setTextSelection({ from: 2, to: 5 })
    expect(resolveRichTextLinkTarget(editor, 'text-quickbar')).toMatchObject({
      mode: 'set',
      range: { from: 2, to: 5 },
      href: '',
      hasLinkMarks: true,
    })
  })

  it('rejects cross-block and atom-containing text selections', () => {
    const editor = createEditor('<p>第一段</p><p>第二段<br>末尾</p>')

    editor.commands.setTextSelection({ from: 2, to: 7 })
    expect(resolveRichTextLinkTarget(editor, 'text-quickbar')).toBeNull()
    expect(resolveRichTextLinkTarget(editor, 'toolbar')).toBeNull()

    editor.commands.setTextSelection({ from: 6, to: 10 })
    expect(resolveRichTextLinkTarget(editor, 'text-quickbar')).toBeNull()
  })

  it('uses stored mode for a collapsed toolbar target without actual link text', () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection(3)
    editor.commands.setLink({ href: 'https://stored.example' })

    expect(resolveRichTextLinkTarget(editor, 'quickbar')).toBeNull()
    expect(resolveRichTextLinkTarget(editor, 'toolbar')).toMatchObject({
      mode: 'stored',
      range: { from: 3, to: 3 },
      href: '',
      hasLinkMarks: false,
      selection: { from: 3, to: 3, empty: true },
    })
  })

  it('rejects text blocks that do not allow link marks', () => {
    const editor = createEditor('<pre><code>const value = 1</code></pre>')
    editor.commands.setTextSelection(3)

    expect(resolveRichTextLinkTarget(editor, 'quickbar')).toBeNull()
    expect(resolveRichTextLinkTarget(editor, 'text-quickbar')).toBeNull()
    expect(resolveRichTextLinkTarget(editor, 'toolbar')).toBeNull()
  })
})
