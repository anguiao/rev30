import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { NodeSelection } from '@tiptap/pm/state'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { describe, expect, it, vi } from 'vitest'
import { runRichTextAction } from '../../../src/editor/action'
import { insertImageAction, updateImageAction } from '../../../src/features/image/editor'
import { imageFeature } from '../../../src/features/image/shared'
import { createTestEditor } from '../../helpers/editor'

const imageAttrs = {
  src: '/api/attachments/image/content',
  alt: '维护图片',
  width: 640,
  height: 360,
}

function createEditor(content: string | object = '<p></p><p>后续正文</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, ...imageFeature.documentExtensions!()],
    content,
  })
}

describe('image editor actions', () => {
  it('inserts and selects the image in one transaction', () => {
    const editor = createEditor()
    const onTransaction = vi.fn()
    editor.on('transaction', onTransaction)

    expect(runRichTextAction(editor, insertImageAction, imageAttrs)).toBe(true)

    expect(onTransaction).toHaveBeenCalledTimes(1)
    expect(onTransaction.mock.calls[0]?.[0].transaction).toMatchObject({
      docChanged: true,
      selectionSet: true,
    })
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect((editor.state.selection as NodeSelection).node).toMatchObject({
      type: editor.schema.nodes.image,
      attrs: imageAttrs,
    })
    expect(editor.getJSON().content).toHaveLength(2)
    expect(editor.getJSON().content?.[1]).toMatchObject({ type: 'paragraph' })

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getHTML()).toBe('<p></p><p>后续正文</p>')
  })

  it('updates and reselects the image in one transaction', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{ type: 'image', attrs: imageAttrs }, { type: 'paragraph' }],
    })
    editor.commands.setNodeSelection(0)
    const onTransaction = vi.fn()
    editor.on('transaction', onTransaction)

    const updatedAttrs = { ...imageAttrs, alt: '更新后的图片', width: 800 }
    expect(runRichTextAction(editor, updateImageAction, updatedAttrs)).toBe(true)

    expect(onTransaction).toHaveBeenCalledTimes(1)
    expect(onTransaction.mock.calls[0]?.[0].transaction).toMatchObject({
      docChanged: true,
      selectionSet: true,
    })
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect((editor.state.selection as NodeSelection).node.attrs).toMatchObject(updatedAttrs)

    expect(editor.commands.undo()).toBe(true)
    expect(editor.state.doc.nodeAt(0)?.attrs).toMatchObject(imageAttrs)
  })

  it('composes insertion with preceding document changes', () => {
    const editor = createEditor('<p>/图片</p><p>后续正文</p>')
    const onTransaction = vi.fn()
    editor.on('transaction', onTransaction)

    expect(
      editor
        .chain()
        .deleteRange({ from: 1, to: 4 })
        .command(insertImageAction.command(imageAttrs))
        .run(),
    ).toBe(true)

    expect(onTransaction).toHaveBeenCalledTimes(1)
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('image')
    expect(editor.getJSON().content).toHaveLength(2)
  })
})
