import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Fragment, Slice } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../../src/core/preset'
import { runRichTextAction } from '../../../src/editor/action'
import { collectRichTextEditorExtensions } from '../../../src/editor/feature'
import {
  defineImagePickerHandler,
  getPastedImageFile,
  imageEditorFeature,
  imagePasteRule,
  insertImageAction,
  transformPastedImageHtml,
  updateImageAction,
} from '../../../src/features/image/editor'
import { imageFeature } from '../../../src/features/image/shared'
import { defineRichTextEditorPreset } from '../../../src/vue/presets/types'
import { createTestEditor } from '../../helpers/editor'

const imageAttrs = {
  src: '/api/attachments/image/content',
  alt: '维护图片',
  width: 640,
  height: 360,
}

function createEditor(content: string | object = '<p></p><p>后续正文</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, ...imageFeature.sharedExtensions!()],
    content,
  })
}

function createFileList(files: readonly File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as FileList
}

function createClipboardEvent(html: string, files: readonly File[] = []): ClipboardEvent {
  return {
    clipboardData: {
      files: createFileList(files),
      getData: (type: string) => (type === 'text/html' ? html : ''),
    } as DataTransfer,
  } as ClipboardEvent
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

  it('updates the selected image in one transaction', () => {
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
        .command((props) => insertImageAction.command(props, imageAttrs))
        .run(),
    ).toBe(true)

    expect(onTransaction).toHaveBeenCalledTimes(1)
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('image')
    expect(editor.getJSON().content).toHaveLength(2)
  })
})

describe('image paste rule', () => {
  it('preserves only a valid ProseMirror slice marker on the first content element', () => {
    const internalHtml =
      '<p data-pm-slice="0 0 []"><img src="data:image/png;base64,aGVsbG8=" /></p>'
    const internalHtmlWithMetadata = `<meta charset="utf-8">${internalHtml}`

    expect(transformPastedImageHtml(internalHtml)).toBe(internalHtml)
    expect(transformPastedImageHtml(internalHtmlWithMetadata)).toBe(internalHtmlWithMetadata)

    for (const externalHtml of [
      '<p>前文<img src="https://example.com/external.png" /></p>',
      '<p>前文</p><div data-pm-slice="0 0 []"><img src="https://example.com/external.png" /></div>',
      '<p data-pm-slice="0 0 not-json">前文<img src="https://example.com/external.png" /></p>',
      '<div>前文<p data-pm-slice="0 0 []"><img src="https://example.com/external.png" /></p></div>',
    ]) {
      const transformedHtml = transformPastedImageHtml(externalHtml)

      expect(transformedHtml).not.toContain('<img')
      expect(transformedHtml).toContain('前文')
    }
  })

  it('selects the first image file while skipping other clipboard files', () => {
    const textFile = new File(['text'], 'note.txt', { type: 'text/plain' })
    const firstImage = new File(['first'], 'first.png', { type: 'image/png' })
    const secondImage = new File(['second'], 'second.jpg', { type: 'image/jpeg' })

    expect(getPastedImageFile(createClipboardEvent('', [textFile, firstImage, secondImage]))).toBe(
      firstImage,
    )
    expect(getPastedImageFile(createClipboardEvent('', [textFile]))).toBeNull()
  })

  it('opens the image picker unless the parsed slice already contains an image', () => {
    const openPicker = vi.fn()
    const preset = defineRichTextPreset({
      key: 'image-paste-test',
      features: [imageFeature],
    })
    const editorPreset = defineRichTextEditorPreset(preset, {
      editorFeatures: [imageEditorFeature],
      interactionHandlers: [defineImagePickerHandler(openPicker)],
    })
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...collectRichTextEditorExtensions(editorPreset)],
      content: '<p></p>',
    })
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })
    const emptySlice = editor.state.selection.content()
    const imageSlice = new Slice(
      Fragment.from(editor.schema.nodeFromJSON({ type: 'image', attrs: imageAttrs })),
      0,
      0,
    )

    expect(
      imagePasteRule.handlePaste?.({
        editor,
        event: createClipboardEvent('', [imageFile]),
        slice: emptySlice,
      }),
    ).toBe(true)
    expect(openPicker).toHaveBeenCalledWith(editor, imageFile)

    expect(
      imagePasteRule.handlePaste?.({
        editor,
        event: createClipboardEvent('<p data-pm-slice="0 0 []"><img /></p>', [imageFile]),
        slice: imageSlice,
      }),
    ).toBe(false)
    expect(openPicker).toHaveBeenCalledOnce()

    expect(
      imagePasteRule.handlePaste?.({
        editor,
        event: createClipboardEvent('<p data-pm-slice="0 0 []">正文</p>', [imageFile]),
        slice: emptySlice,
      }),
    ).toBe(true)
    expect(openPicker).toHaveBeenCalledTimes(2)
  })
})
