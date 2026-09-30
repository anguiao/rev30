import { NodeSelection } from '@tiptap/pm/state'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../../../../src/client/editor/feature'
import { openImagePicker } from '../../../../../src/features/image/client/editor'
import { imageToolbarControl } from '../../../../../src/features/image/client/vue'
import { createTestEditor } from '../../../../helpers/editor'
import { createClipboardEvent } from '../../../../helpers/clipboard'
import { createImageTestEditorPreset } from '../../../../helpers/image-editor'

const createObjectUrl = vi.fn(() => 'blob:local-image')

function createEditor(
  content = '<p>维护正文</p>',
  upload: (file: File) => Promise<{ src: string }> = async () => ({ src: '/images/uploaded.png' }),
) {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(createImageTestEditorPreset({ upload })),
    content,
  })
}

beforeEach(() => {
  createObjectUrl.mockClear()
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null
      naturalWidth = 1000
      naturalHeight = 500
      set src(value: string) {
        if (value !== '') queueMicrotask(() => this.onload?.())
      }
    },
  )
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectUrl)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => vi.unstubAllGlobals())

describe('ImageDialog editor integration', () => {
  it('inserts ordered images at the captured editor selection in one confirmation', async () => {
    const upload = vi.fn(async (selected: File) => ({ src: `/images/${selected.name}` }))
    const editor = createEditor('<p>前需替换后</p>', upload)
    editor.commands.setTextSelection({ from: 2, to: 5 })
    const toolbar = mount(imageToolbarControl.component, {
      global: { stubs: { transition: false } },
      props: { ...imageToolbarControl.props, editor: markRaw(editor), disabled: false },
    })
    await toolbar.get('[data-test="rich-text-image"]').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    dialog.get('[data-test="rich-text-image-drop-zone"]').element.dispatchEvent(
      createClipboardEvent({
        files: [
          new File(['image'], 'first.png', { type: 'image/png' }),
          new File(['image'], 'second.png', { type: 'image/png' }),
        ],
      }),
    )
    await flushPromises()
    editor.commands.setTextSelection(1)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    expect(editor.getJSON().content?.slice(1, 3)).toMatchObject([
      { type: 'image', attrs: { src: '/images/first.png' } },
      { type: 'image', attrs: { src: '/images/second.png' } },
    ])
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('前需替换后')
  })

  it('focuses the local image chooser in the empty dialog', async () => {
    const editor = createEditor()
    openImagePicker(editor)
    await flushPromises()

    expect(document.activeElement).toBe(
      document.querySelector('[data-test="rich-text-image-file"]'),
    )
  })

  it('opens an empty dialog with the limit message for oversized initial pasted files', async () => {
    const editor = createEditor()
    openImagePicker(
      editor,
      Array.from(
        { length: 21 },
        (_, index) => new File(['image'], `${index}.png`, { type: 'image/png' }),
      ),
    )
    await flushPromises()

    const dialog = new DOMWrapper(document.body)
    expect(dialog.find('[aria-label="点击选择或拖入图片"]').exists()).toBe(true)
    expect(dialog.get('[role="alert"]').text()).toBe('最多选择 20 张图片，还可添加 20 张')
    expect(createObjectUrl).not.toHaveBeenCalled()
  })

  it('keeps editing on the selected node and applies dimensions without uploading', async () => {
    const upload = vi.fn()
    const editor = createEditor(
      '<img src="/images/existing.png" alt="原说明" width="500" height="250" />',
      upload,
    )
    editor.commands.setNodeSelection(0)
    openImagePicker(editor)
    await flushPromises()
    const dialog = new DOMWrapper(document.body)

    expect(dialog.get('[role="dialog"]').attributes('aria-label')).toBe('编辑图片')
    expect(dialog.find('[data-test="rich-text-image-candidate-list"]').exists()).toBe(false)
    const width = dialog.get('[data-test="rich-text-image-width"] input')
    await width.setValue('600')
    await width.trigger('blur')
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'image',
      attrs: { src: '/images/existing.png', alt: '原说明', width: 600, height: 300 },
    })
    expect(editor.getJSON().content).toHaveLength(1)
  })

  it('keeps the original image when a replacement upload fails', async () => {
    const upload = vi.fn(async () => {
      throw new Error('Upload failed')
    })
    const editor = createEditor(
      '<img src="/images/existing.png" alt="原说明" width="500" height="250" />',
      upload,
    )
    const originalDocument = editor.getJSON()
    editor.commands.setNodeSelection(0)
    openImagePicker(editor, [new File(['image'], 'replacement.png', { type: 'image/png' })])
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(upload).toHaveBeenCalledOnce()
    expect(editor.getJSON()).toEqual(originalDocument)
    expect(dialog.text()).toContain('上传失败')
    expect(document.querySelector('[data-test="rich-text-image-dialog-content"]')).not.toBeNull()
  })

  it('focuses image properties after reading and ignores composing Escape', async () => {
    const editor = createEditor(
      '<img src="/images/existing.png" alt="原说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    openImagePicker(editor)
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    const alt = dialog.get('[data-test="rich-text-image-alt"] input').element
    expect(document.activeElement).toBe(alt)

    const composingEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(composingEscape, 'isComposing', { value: true })
    alt.dispatchEvent(composingEscape)
    await flushPromises()
    expect(document.querySelector('[data-test="rich-text-image-dialog-content"]')).not.toBeNull()

    alt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[data-test="rich-text-image-dialog-content"]')).toBeNull()
  })

  it('closes on editor destruction and ignores a late upload result', async () => {
    let resolveUpload!: (value: { src: string }) => void
    const upload = vi.fn(
      () =>
        new Promise<{ src: string }>((resolve) => {
          resolveUpload = resolve
        }),
    )
    const editor = createEditor('<p>原文</p>', upload)
    const initialDocument = editor.getJSON()
    openImagePicker(editor, [new File(['image'], 'local.png', { type: 'image/png' })])
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    expect(upload).toHaveBeenCalledOnce()

    editor.destroy()
    await flushPromises()
    expect(document.querySelector('[data-test="rich-text-image-dialog-content"]')).toBeNull()
    resolveUpload({ src: '/images/uploaded.png' })
    await flushPromises()
    expect(editor.getJSON()).toEqual(initialDocument)
  })

  it('keeps internal copied images and filters external HTML images', async () => {
    const editor = createEditor('<p>目标</p>')
    const internal = createClipboardEvent({
      html: '<img data-pm-slice="0 0 []" src="data:image/png;base64,aGVsbG8=" />',
      files: [new File(['image'], 'internal.png', { type: 'image/png' })],
    })
    editor.view.dom.dispatchEvent(internal)
    await flushPromises()
    expect(editor.getJSON().content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
    )
    expect(document.querySelector('[data-test="rich-text-image-dialog-content"]')).toBeNull()

    const external = createClipboardEvent({
      html: '<p>保留<img src="https://example.com/external.png" />文字</p>',
    })
    editor.view.dom.dispatchEvent(external)
    await flushPromises()
    expect(editor.getText()).toContain('保留文字')
    expect(editor.getHTML()).not.toContain('https://example.com/external.png')
  })
})
