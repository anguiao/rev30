import { Fragment, Slice } from '@tiptap/pm/model'
import { AllSelection, NodeSelection } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'
import { collectRichTextEditorExtensions } from '../../../src/editor/feature'
import { linkPasteRule } from '../../../src/features/link/editor'
import { compactRichTextEditorPreset } from '../../../src/vue/presets/compact'
import { createAllRichTextEditorPreset } from '../../../src/vue/presets/all'
import { createTestEditor } from '../../helpers/editor'

interface ClipboardContents {
  readonly text?: string
  readonly html?: string
  readonly files?: readonly File[]
}

function createFileList(files: readonly File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as FileList
}

function createClipboardEvent(contents: ClipboardContents = {}): ClipboardEvent {
  return {
    clipboardData: {
      files: createFileList(contents.files ?? []),
      getData(type: string) {
        if (type === 'text/plain') {
          return contents.text ?? ''
        }

        return type === 'text/html' ? (contents.html ?? '') : ''
      },
    } as DataTransfer,
  } as ClipboardEvent
}

function paste(editor: Editor, contents: ClipboardContents) {
  const slice = new Slice(Fragment.from(editor.schema.text(contents.text ?? '')), 0, 0)

  return editor.view.someProp('handlePaste', (handler) =>
    handler(editor.view, createClipboardEvent(contents), slice),
  )
}

function createCompactEditor(content = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
    content,
  })
}

function createAllEditor(content: string | object) {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(
      createAllRichTextEditorPreset({
        image: {
          upload: async (file) => ({ src: `/api/attachments/${file.name}/content` }),
        },
      }),
    ),
    content,
  })
}

function selectParagraphText(editor: Editor) {
  editor.commands.setTextSelection({ from: 1, to: editor.state.doc.nodeSize - 3 })
}

function expectPasteIsNotConsumed(editor: Editor) {
  const document = editor.getJSON()

  expect(paste(editor, { text: 'https://example.com/pasted' })).not.toBe(true)
  expect(editor.getJSON()).toEqual(document)
}

function expectLinkRuleIsNotConsumed(editor: Editor) {
  const document = editor.getJSON()
  const slice = new Slice(Fragment.from(editor.schema.text('https://example.com/pasted')), 0, 0)

  expect(
    linkPasteRule.handlePaste?.({
      editor,
      event: createClipboardEvent({ text: 'https://example.com/pasted' }),
      slice,
    }),
  ).toBe(false)
  expect(editor.getJSON()).toEqual(document)
}

describe('link paste rule', () => {
  it('adds canonical URL and email marks without replacing an explicit text selection', () => {
    const urlEditor = createCompactEditor()
    selectParagraphText(urlEditor)

    expect(paste(urlEditor, { text: '  example.com/pasted\n' })).toBe(true)
    expect(urlEditor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              text: '维护通知',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/pasted' } }],
            },
          ],
        },
      ],
    })

    const emailEditor = createCompactEditor()
    selectParagraphText(emailEditor)

    expect(paste(emailEditor, { text: ' admin@example.com ' })).toBe(true)
    expect(emailEditor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              text: '维护通知',
              marks: [{ type: 'link', attrs: { href: 'mailto:admin@example.com' } }],
            },
          ],
        },
      ],
    })
  })

  it.each([
    { name: 'empty plain text', contents: { text: '   ' } },
    {
      name: 'rich HTML URL fragment',
      contents: { text: 'https://example.com', html: '<p>https://example.com</p>' },
    },
    { name: 'unsupported URL', contents: { text: 'ftp://example.com' } },
    { name: 'additional plain text', contents: { text: 'https://example.com and more' } },
    { name: 'telephone token', contents: { text: 'tel:123' } },
    {
      name: 'any clipboard file',
      contents: {
        text: 'https://example.com',
        files: [new File(['note'], 'note.txt', { type: 'text/plain' })],
      },
    },
  ])('does not consume $name', ({ contents }) => {
    const editor = createCompactEditor()
    selectParagraphText(editor)
    const document = editor.getJSON()

    expect(paste(editor, contents)).not.toBe(true)
    expect(editor.getJSON()).toEqual(document)
  })

  it('does not consume empty, all, node, or cross-textblock selections', () => {
    const emptyEditor = createCompactEditor()
    emptyEditor.commands.setTextSelection(1)
    expectPasteIsNotConsumed(emptyEditor)

    const allEditor = createCompactEditor()
    allEditor.view.dispatch(allEditor.state.tr.setSelection(new AllSelection(allEditor.state.doc)))
    expectPasteIsNotConsumed(allEditor)

    const nodeEditor = createCompactEditor()
    nodeEditor.view.dispatch(
      nodeEditor.state.tr.setSelection(NodeSelection.create(nodeEditor.state.doc, 0)),
    )
    expectPasteIsNotConsumed(nodeEditor)

    const crossTextblockEditor = createCompactEditor('<p>第一段</p><p>第二段</p>')
    crossTextblockEditor.commands.setTextSelection({
      from: 1,
      to: crossTextblockEditor.state.doc.content.size - 1,
    })
    expectPasteIsNotConsumed(crossTextblockEditor)
  })

  it('does not consume a table cell selection or text in a block that disallows links', () => {
    const tableEditor = createAllEditor({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '单元格' }] }],
                },
              ],
            },
          ],
        },
      ],
    })
    const table = tableEditor.state.doc.firstChild
    if (!table) {
      throw new Error('Expected a table')
    }
    const tableMap = TableMap.get(table)
    const cell = tableEditor.state.doc.resolve(1 + tableMap.map[0]!)
    tableEditor.view.dispatch(tableEditor.state.tr.setSelection(new CellSelection(cell)))
    expectLinkRuleIsNotConsumed(tableEditor)

    const codeBlockEditor = createAllEditor('<pre><code>代码</code></pre>')
    codeBlockEditor.commands.setTextSelection({ from: 1, to: 3 })
    expectLinkRuleIsNotConsumed(codeBlockEditor)
  })
})
