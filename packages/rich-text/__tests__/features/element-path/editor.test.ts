import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { AllSelection, NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { Node as TiptapNode } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { describe, expect, it } from 'vitest'
import { runRichTextAction } from '../../../src/editor/action'
import {
  elementPathEditorFeature,
  resolveElementPath,
  selectElementPathItemAction,
} from '../../../src/features/element-path/editor'
import { elementPathFeature } from '../../../src/features/element-path/core/feature'
import { boldFeature } from '../../../src/features/bold/core/feature'
import { blockquoteFeature } from '../../../src/features/blockquote/core/feature'
import { headingFeature } from '../../../src/features/heading/core/feature'
import { imageFeature } from '../../../src/features/image/core/feature'
import { italicFeature } from '../../../src/features/italic/core/feature'
import { linkFeature } from '../../../src/features/link/core/feature'
import { listFeature } from '../../../src/features/list/core/feature'
import { baseFeature } from '../../../src/features/base/core/feature'
import { tableFeature } from '../../../src/features/table/core/feature'
import { createTestEditor } from '../../helpers/editor'

function createEditor(
  content: string | object = '<p>维护通知</p>',
  options: { readonly history?: boolean } = {},
) {
  return createTestEditor({
    extensions: [
      ...baseFeature.sharedExtensions!(),
      ...boldFeature.sharedExtensions!(),
      ...italicFeature.sharedExtensions!(),
      ...linkFeature.sharedExtensions!(),
      ...headingFeature.sharedExtensions!(),
      ...blockquoteFeature.sharedExtensions!(),
      ...listFeature.sharedExtensions!(),
      ...imageFeature.sharedExtensions!(),
      ...tableFeature.sharedExtensions!(),
      ...(options.history ? [UndoRedo] : []),
    ],
    content,
  })
}

function findTextPosition(editor: ReturnType<typeof createEditor>, text: string, offset = 0) {
  let position: number | null = null

  editor.state.doc.descendants((node, pos) => {
    if (position === null && node.isText && node.text === text) {
      position = pos + offset
    }
  })

  if (position === null) {
    throw new Error(`Text node not found: ${text}`)
  }

  return position
}

function tags(editor: ReturnType<typeof createEditor>) {
  return resolveElementPath(editor.state).map((item) => item.tag)
}

describe('element path editor feature', () => {
  it('declares an editor-only feature without extensions', () => {
    expect(elementPathFeature).toMatchObject({
      key: 'element-path',
      editorImplementation: true,
      serverImplementation: false,
    })
    expect(elementPathFeature.sharedExtensions).toBeUndefined()
    expect(elementPathEditorFeature.feature.key).toBe('element-path')
    expect(elementPathEditorFeature.extensions).toBeUndefined()
  })

  it('resolves the selection.from path for collapsed, reverse, and cross-block text selections', () => {
    const editor = createEditor('<blockquote><p><strong>甲乙</strong></p></blockquote><p>后续</p>')
    const start = findTextPosition(editor, '甲乙', 1)

    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start)),
    )
    expect(tags(editor)).toEqual(['blockquote', 'p', 'strong'])

    const reverse = TextSelection.create(editor.state.doc, start + 1, start)
    editor.view.dispatch(editor.state.tr.setSelection(reverse))
    expect(tags(editor)).toEqual(['blockquote', 'p', 'strong'])

    const crossBlock = TextSelection.create(
      editor.state.doc,
      start,
      findTextPosition(editor, '后续', 1),
    )
    editor.view.dispatch(editor.state.tr.setSelection(crossBlock))
    expect(tags(editor)).toEqual(['blockquote', 'p', 'strong'])
  })

  it('keeps a textblock at its end, excludes hard breaks, and derives dynamic schema tags', () => {
    const editor = createEditor('<p><strong>甲</strong></p><p><em>乙</em></p>')
    const first = findTextPosition(editor, '甲')
    const second = findTextPosition(editor, '乙', 1)
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, first + 1, second)),
    )
    expect(tags(editor)).toEqual(['p'])

    const breakEditor = createEditor('<p>甲<br>乙</p>')
    const breakPosition = findTextPosition(breakEditor, '甲') + 1
    breakEditor.view.dispatch(
      breakEditor.state.tr.setSelection(TextSelection.create(breakEditor.state.doc, breakPosition)),
    )
    expect(tags(breakEditor)).toEqual(['p'])

    const headingEditor = createEditor('<h2>标题</h2>')
    headingEditor.commands.setTextSelection(2)
    expect(tags(headingEditor)).toEqual(['h2'])

    const CustomParagraph = Paragraph.extend({
      renderHTML: () => ['article', 0],
    })
    const customEditor = createTestEditor({
      extensions: [Document, CustomParagraph, Text, HardBreak],
      content: '<p>自定义</p>',
    })
    expect(tags(customEditor)).toEqual(['article'])

    const NamespaceParagraph = Paragraph.extend({
      renderHTML: () => ['http://www.w3.org/2000/svg svg', 0],
    })
    const namespaceEditor = createTestEditor({
      extensions: [Document, NamespaceParagraph, Text, HardBreak],
      content: '<p>命名空间</p>',
    })
    expect(tags(namespaceEditor)).toEqual(['svg'])
  })

  it('resolves all-selection, gap-cursor, and node-selection semantics', () => {
    const editor = createEditor('<p><strong>甲</strong></p><p>乙</p>')

    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
    expect(tags(editor)).toEqual(['p', 'strong'])

    const firstParagraph = editor.state.doc.firstChild
    if (!firstParagraph) throw new Error('Expected first paragraph')
    const gap = new GapCursor(editor.state.doc.resolve(firstParagraph.nodeSize))
    editor.view.dispatch(editor.state.tr.setSelection(gap))
    expect(tags(editor)).toEqual([])

    const imageEditor = createEditor({
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'image', attrs: { src: '/img', alt: null } }],
    })
    imageEditor.commands.setNodeSelection(imageEditor.state.doc.child(0).nodeSize)
    expect(imageEditor.state.selection).toBeInstanceOf(NodeSelection)
    expect(tags(imageEditor)).toEqual(['img'])
    const imagePath = resolveElementPath(imageEditor.state).at(-1)
    if (!imagePath) throw new Error('Expected image path item')
    expect(runRichTextAction(imageEditor, selectElementPathItemAction, imagePath)).toBe(true)
    expect(imageEditor.state.selection).toBeInstanceOf(NodeSelection)
  })

  it('resolves table roles from parseDOM and stops a cell path at the cell', () => {
    const editor = createEditor({
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
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '甲' }] }],
                },
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '乙' }] }],
                },
              ],
            },
          ],
        },
      ],
    })
    const table = editor.state.doc.firstChild
    if (!table) throw new Error('Expected table')
    const map = TableMap.get(table)
    const tableStart = 1
    const first = editor.state.doc.resolve(tableStart + map.map[0]!)
    const last = editor.state.doc.resolve(tableStart + map.map.at(-1)!)
    editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(first, last)))
    expect(tags(editor)).toEqual(['table', 'tr', 'td'])

    const cell = resolveElementPath(editor.state).at(-1)
    if (!cell) throw new Error('Expected cell path item')
    expect(runRichTextAction(editor, selectElementPathItemAction, cell)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(CellSelection)
    const selectedCellPositions = new Set<number>()
    ;(editor.state.selection as CellSelection).forEachCell((_node, pos) =>
      selectedCellPositions.add(pos),
    )
    expect(selectedCellPositions).toEqual(new Set([tableStart + map.map[0]!]))

    const row = resolveElementPath(editor.state).find(
      (item) => item.kind === 'node' && item.tag === 'tr',
    )
    if (!row) throw new Error('Expected row path item')
    expect(runRichTextAction(editor, selectElementPathItemAction, row)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(CellSelection)
    expect((editor.state.selection as CellSelection).isRowSelection()).toBe(true)
    const rowCellPositions = new Set<number>()
    ;(editor.state.selection as CellSelection).forEachCell((_node, pos) =>
      rowCellPositions.add(pos),
    )
    expect(rowCellPositions).toEqual(new Set(map.map.map((pos) => tableStart + pos)))

    const tablePath = resolveElementPath(editor.state).find(
      (item) => item.kind === 'node' && item.tag === 'table',
    )
    if (!tablePath) throw new Error('Expected table path item')
    expect(runRichTextAction(editor, selectElementPathItemAction, tablePath)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(CellSelection)
    const tableCellPositions = new Set<number>()
    ;(editor.state.selection as CellSelection).forEachCell((_node, pos) =>
      tableCellPositions.add(pos),
    )
    expect(tableCellPositions).toEqual(new Set(map.map.map((pos) => tableStart + pos)))

    const headerCell = editor.state.doc.resolve(tableStart + map.map[1]!)
    editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(headerCell)))
    expect(tags(editor)).toEqual(['table', 'tr', 'th'])
  })

  it('keeps actual marks and merges nested mark ranges without reading stored marks', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '甲', marks: [{ type: 'bold' }] },
            { type: 'text', text: '乙', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: '丙', marks: [{ type: 'bold' }] },
            { type: 'text', text: '丁' },
          ],
        },
      ],
    })
    const nested = findTextPosition(editor, '乙', 1)
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, nested)),
    )
    const path = resolveElementPath(editor.state)
    expect(path.map((item) => item.tag)).toEqual(['p', 'strong', 'em'])

    const bold = path.find((item) => item.kind === 'mark' && item.tag === 'strong')
    if (!bold || bold.kind !== 'mark') throw new Error('Expected bold path item')
    expect(runRichTextAction(editor, selectElementPathItemAction, bold)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.state.selection.from).toBe(bold.from)
    expect(editor.state.selection.to).toBe(bold.to)

    const plainPosition = findTextPosition(editor, '丁')
    editor.commands.setTextSelection(plainPosition + 1)
    editor.view.dispatch(editor.state.tr.setStoredMarks([editor.schema.marks.bold!.create()]))
    expect(tags(editor)).toEqual(['p'])
  })

  it('keeps adjacent marks with different attributes as separate path ranges', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '甲',
              marks: [{ type: 'link', attrs: { href: 'https://a.example/' } }],
            },
            {
              type: 'text',
              text: '乙',
              marks: [{ type: 'link', attrs: { href: 'https://b.example/' } }],
            },
          ],
        },
      ],
    })
    const second = findTextPosition(editor, '乙')
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, second, second + 1)),
    )
    const path = resolveElementPath(editor.state)
    expect(path.map((item) => item.tag)).toEqual(['p', 'a'])
    const link = path.at(-1)
    if (!link || link.kind !== 'mark') throw new Error('Expected link path item')
    expect({ from: link.from, to: link.to }).toEqual({ from: second, to: second + 1 })
  })

  it('selects node contents, marks, cells, and refuses disabled editors without document changes', () => {
    const editor = createEditor('<blockquote><p>甲乙</p><p>丙</p></blockquote>')
    editor.commands.setTextSelection(findTextPosition(editor, '甲乙'))
    const blockquote = resolveElementPath(editor.state).find(
      (item) => item.kind === 'node' && item.tag === 'blockquote',
    )
    if (!blockquote || blockquote.kind !== 'node') throw new Error('Expected blockquote')
    const before = editor.getJSON()
    expect(runRichTextAction(editor, selectElementPathItemAction, blockquote)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.state.selection.from).toBe(blockquote.from + 2)
    expect(editor.state.doc.toJSON()).toEqual(before)

    editor.setEditable(false)
    expect(runRichTextAction(editor, selectElementPathItemAction, blockquote)).toBe(false)

    const emptyEditor = createEditor('<p></p><p>后续</p>')
    emptyEditor.commands.setTextSelection(1)
    const emptyPath = resolveElementPath(emptyEditor.state).at(-1)
    if (!emptyPath) throw new Error('Expected empty paragraph path item')
    expect(runRichTextAction(emptyEditor, selectElementPathItemAction, emptyPath)).toBe(true)
    expect(emptyEditor.state.selection).toBeInstanceOf(TextSelection)
    expect(emptyEditor.state.selection.empty).toBe(true)

    const AtomContainer = TiptapNode.create({
      name: 'atomContainer',
      group: 'block',
      content: 'image*',
      atom: true,
      parseHTML: () => [{ tag: 'div[data-atom-container]' }],
      renderHTML: () => ['div', { 'data-atom-container': 'true' }, 0],
    })
    const atomEditor = createTestEditor({
      extensions: [
        ...baseFeature.sharedExtensions!(),
        ...imageFeature.sharedExtensions!(),
        AtomContainer,
      ],
      content: {
        type: 'doc',
        content: [
          {
            type: 'atomContainer',
            content: [{ type: 'image', attrs: { src: '/atom', alt: null } }],
          },
        ],
      },
    })
    atomEditor.commands.setNodeSelection(0)
    const atomPath = resolveElementPath(atomEditor.state).at(-1)
    if (!atomPath) throw new Error('Expected atom container path item')
    expect(runRichTextAction(atomEditor, selectElementPathItemAction, atomPath)).toBe(true)
    expect(atomEditor.state.selection).toBeInstanceOf(NodeSelection)
    expect((atomEditor.state.selection as NodeSelection).node.type.name).toBe('atomContainer')
  })

  it('selects table rows and tables through TableMap with rowspans', () => {
    const editor = createEditor({
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
                  attrs: { rowspan: 2 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '甲' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '乙' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '丙' }] }],
                },
              ],
            },
          ],
        },
      ],
    })
    editor.commands.setTextSelection(findTextPosition(editor, '丙'))
    const row = resolveElementPath(editor.state)
      .filter((item) => item.kind === 'node' && item.tag === 'tr')
      .at(-1)
    if (!row) throw new Error('Expected rowspan row path item')
    expect(runRichTextAction(editor, selectElementPathItemAction, row)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(CellSelection)
    const selected = new Set<number>()
    ;(editor.state.selection as CellSelection).forEachCell((_node, pos) => selected.add(pos))
    const table = editor.state.doc.firstChild
    if (!table) throw new Error('Expected rowspan table')
    const map = TableMap.get(table)
    const tableStart = 1
    const rowStart = map.width
    const rowEnd = rowStart + map.width
    const rowRect = map.rectBetween(map.map[rowStart]!, map.map[rowEnd - 1]!)
    const expectedRowCells = new Set(map.cellsInRect(rowRect).map((pos) => tableStart + pos))
    expect(selected).toEqual(expectedRowCells)
  })

  it('dispatches a selection-only transaction without adding history', () => {
    const editor = createEditor('<p>维护通知</p>', { history: true })
    const transactions: Transaction[] = []
    editor.on('transaction', ({ transaction }) => transactions.push(transaction))
    const paragraph = resolveElementPath(editor.state)[0]
    if (!paragraph) throw new Error('Expected paragraph path item')
    const before = editor.getJSON()

    expect(runRichTextAction(editor, selectElementPathItemAction, paragraph)).toBe(true)
    const transaction = transactions.at(-1)
    if (!transaction) throw new Error('Expected selection transaction')
    expect(transaction.docChanged).toBe(false)
    expect(transaction.selectionSet).toBe(true)
    expect(transaction.scrolledIntoView).toBe(true)
    expect(transaction.getMeta('addToHistory')).toBe(false)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.commands.undo()).toBe(false)
  })
})
