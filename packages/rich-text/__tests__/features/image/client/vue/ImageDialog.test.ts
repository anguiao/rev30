import { NodeSelection } from '@tiptap/pm/state'
import { DOMWrapper, flushPromises, mount, type BaseWrapper } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { markRaw, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../../../../src/client/editor/feature'
import {
  imageActionItem,
  type RichTextImageAttrs,
} from '../../../../../src/features/image/client/editor'
import {
  imageToolbarControl,
  type RichTextImageUploadOptions,
} from '../../../../../src/features/image/client/vue'
import ImageDialog from '../../../../../src/features/image/client/vue/ImageDialog.vue'
import {
  richTextSlashCommand,
  runRichTextSlashCommand,
} from '../../../../../src/client/vue/slash-menu'
import { createTestEditor } from '../../../../helpers/editor'
import { createImageTestEditorPreset } from '../../../../helpers/image-editor'

type FileDialogChangeHandler = (files: FileList | null) => void
type FileDialogOptions = {
  accept?: string
  multiple?: boolean
  reset?: boolean
}
type DropZoneOptions = {
  onDrop?: (files: File[] | null, event: DragEvent) => void
}

const fileDialog = vi.hoisted(() => ({
  options: [] as FileDialogOptions[],
  changeHandlers: [] as FileDialogChangeHandler[],
  open: vi.fn(),
  reset: vi.fn(),
}))
const dropZone = vi.hoisted(() => ({
  options: [] as DropZoneOptions[],
  isOverDropZone: { value: false },
}))
const imageAttrs = {
  src: '/images/context.png',
  alt: '上下文图片',
  width: 640,
  height: 360,
}

vi.mock('@vueuse/core', async (importOriginal) => {
  const vueuse = await importOriginal<typeof import('@vueuse/core')>()

  return {
    ...vueuse,
    useDropZone: vi.fn((_target: unknown, options: DropZoneOptions) => {
      dropZone.options.push(options)

      return {
        files: { value: null },
        isOverDropZone: dropZone.isOverDropZone,
      }
    }),
    useFileDialog: vi.fn((options: FileDialogOptions) => {
      fileDialog.options.push(options)

      return {
        files: { value: null },
        open: fileDialog.open,
        reset: fileDialog.reset,
        onChange: (handler: FileDialogChangeHandler) => {
          fileDialog.changeHandlers.push(handler)
        },
      }
    }),
  }
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function createEditor(
  content = '<p>维护通知</p>',
  options: RichTextImageUploadOptions = {
    upload: async () => ({ src: imageAttrs.src }),
  },
) {
  const preset = createImageTestEditorPreset(options)

  return createTestEditor({
    extensions: collectRichTextEditorExtensions(preset),
    content,
  })
}

function createImagePasteEditor(upload: RichTextImageUploadOptions['upload']) {
  const preset = createImageTestEditorPreset({ upload })

  return createTestEditor({
    extensions: collectRichTextEditorExtensions(preset),
    content: '<p>粘贴目标</p>',
  })
}

function mountControl(editor: Editor) {
  return mount(imageToolbarControl.component, {
    props: {
      ...imageToolbarControl.props,
      editor: markRaw(editor),
      disabled: false,
    },
  })
}

function createHistoryEditor(
  content = '<p>/图片</p>',
  options: RichTextImageUploadOptions = {
    upload: async () => ({ src: imageAttrs.src }),
  },
) {
  const preset = createImageTestEditorPreset(options)

  return createTestEditor({
    extensions: collectRichTextEditorExtensions(preset),
    content,
  })
}

const imageSlashCommand = richTextSlashCommand(imageActionItem)

function openImageFromSlash(editor: ReturnType<typeof createHistoryEditor>) {
  return runRichTextSlashCommand(editor, imageSlashCommand, { from: 1, to: 4 })
}

function mountDialog(
  upload = vi.fn(),
  onError = vi.fn(),
  existingImage?: RichTextImageAttrs,
  initialImageFile?: File,
) {
  return mount(ImageDialog, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      upload,
      onError,
      existingImage,
      initialImageFile,
    },
  })
}

function mountEditDialog(image: RichTextImageAttrs) {
  return mountDialog(vi.fn(), vi.fn(), image)
}

function createFileList(...files: File[]): FileList {
  return Object.assign(files, {
    item: (index: number) => files[index] ?? null,
  })
}

function createDataTransferItems(...files: File[]) {
  const items = files.map((file) => ({
    kind: 'file',
    type: file.type,
    getAsFile: () => file,
  }))

  // Partial DOM mock with only the fields used by the component.
  return Object.assign(items, {
    item: (index: number) => items[index] ?? null,
  }) as unknown as DataTransferItemList
}

function createClipboardData(...files: File[]) {
  return {
    files: createFileList(...files),
    items: createDataTransferItems(...files),
  } as DataTransfer
}

function dispatchEditorPaste(editor: Editor, files: File[], html = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: createFileList(...files),
      getData: (type: string) => (type === 'text/html' ? html : ''),
    } as DataTransfer,
  })

  editor.view.dom.dispatchEvent(event)

  return event
}

async function chooseFile(_wrapper: BaseWrapper<Node>, file: File) {
  const onChange = fileDialog.changeHandlers.at(-1)
  if (onChange === undefined) {
    throw new Error('File dialog change handler is not registered')
  }

  onChange(createFileList(file))
  await nextTick()
}

async function dropFiles(files: File[]) {
  const onDrop = dropZone.options.at(-1)?.onDrop
  if (onDrop === undefined) {
    throw new Error('Drop zone handler is not registered')
  }

  onDrop(files, new Event('drop') as DragEvent)
  await nextTick()
}

async function pasteFiles(
  files: File[],
  target: Element,
  options: { defaultPrevented?: boolean } = {},
) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: createClipboardData(...files),
  })

  if (options.defaultPrevented) {
    event.preventDefault()
  }

  target.dispatchEvent(event)
  await nextTick()

  return event
}

async function uploadSelectedFile(wrapper: BaseWrapper<Node>) {
  await wrapper.get('[data-test="rich-text-image-upload-action"]').trigger('click')
  await flushPromises()
}

async function loadPreviewImage(wrapper: BaseWrapper<Node>, width = 800, height = 450) {
  const image = wrapper.get('[data-test="rich-text-image-preview"] img')
  Object.defineProperty(image.element, 'naturalWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(image.element, 'naturalHeight', {
    configurable: true,
    value: height,
  })

  await image.trigger('load')
}

async function failPreviewImage(wrapper: BaseWrapper<Node>) {
  await wrapper.get('[data-test="rich-text-image-preview"] img').trigger('error')
}

function getPreviewImageSrc(wrapper: BaseWrapper<Node>) {
  return wrapper.get('[data-test="rich-text-image-preview"] img').attributes('src')
}

afterEach(() => {
  vi.restoreAllMocks()
  fileDialog.changeHandlers.length = 0
  fileDialog.options.length = 0
  fileDialog.open.mockClear()
  fileDialog.reset.mockClear()
  dropZone.options.length = 0
  dropZone.isOverDropZone.value = false
})

describe('ImageToolbarControl', () => {
  it('uploads the selected file manually and inserts the image after confirmation', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor(undefined, { upload })
    const toolbar = mountControl(editor)

    await toolbar.get('[data-test="rich-text-image"]').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body)

    expect(fileDialog.options.at(-1)).toMatchObject({
      accept: 'image/*',
      multiple: false,
      reset: true,
    })
    await dialog.get('[data-test="rich-text-image-file"]').trigger('click')
    expect(fileDialog.open).toHaveBeenCalledWith()
    await chooseFile(dialog, new File(['image'], 'cover.png', { type: 'image/png' }))
    expect(upload).not.toHaveBeenCalled()
    await loadPreviewImage(dialog)
    expect(dialog.get('[data-test="rich-text-image-confirm"]').attributes('disabled')).toBeDefined()

    await uploadSelectedFile(dialog)
    await loadPreviewImage(dialog)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(upload).toHaveBeenCalledOnce()
    expect(editor.getJSON().content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          attrs: expect.objectContaining({
            src: '/api/attachments/cover.png/content',
            alt: 'cover.png',
            width: 800,
            height: 450,
          }),
        }),
      ]),
    )
  })

  it('keeps the editor and local candidate when upload resolves an empty image source', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:empty-image-source')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const upload = vi.fn(async () => ({ src: '' }))
    const onError = vi.fn()
    const editor = createEditor(undefined, { upload, onError })
    const initialDocument = editor.getJSON()
    const toolbar = mountControl(editor)

    await toolbar.get('[data-test="rich-text-image"]').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    await chooseFile(dialog, new File(['image'], 'empty.png', { type: 'image/png' }))

    expect(getPreviewImageSrc(dialog)).toBe('blob:empty-image-source')

    await uploadSelectedFile(dialog)

    expect(onError.mock.calls.at(-1)?.[0]).toMatchObject({ message: '图片加载失败' })
    expect(getPreviewImageSrc(dialog)).toBe('blob:empty-image-source')
    expect(dialog.get('[data-test="rich-text-image-confirm"]').attributes('disabled')).toBeDefined()
    expect(
      dialog.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()
    expect(editor.getJSON()).toEqual(initialDocument)

    await uploadSelectedFile(dialog)

    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('replaces the selected text when inserting an image', async () => {
    const editor = createEditor('<p>replace</p>', {
      upload: async () => ({ src: '/api/attachments/replacement/content' }),
    })
    editor.commands.setTextSelection({ from: 1, to: 8 })
    const toolbar = mountControl(editor)
    const button = toolbar.get('[data-test="rich-text-image"]')

    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()

    const dialog = new DOMWrapper(document.body)
    await chooseFile(dialog, new File(['image'], 'replacement.png', { type: 'image/png' }))
    await uploadSelectedFile(dialog)
    await loadPreviewImage(dialog)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getText()).not.toContain('replace')
    expect(editor.state.doc.firstChild?.type.name).toBe('image')
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
  })

  it('keeps the selection captured when the dialog opens', async () => {
    const editor = createEditor('<p>first</p><p>second</p>', {
      upload: async () => ({ src: '/api/attachments/frozen/content' }),
    })
    editor.commands.setTextSelection({ from: 1, to: 6 })
    const toolbar = mountControl(editor)

    await toolbar.get('[data-test="rich-text-image"]').trigger('click')
    await flushPromises()
    editor.commands.setTextSelection(8)

    const dialog = new DOMWrapper(document.body)
    await chooseFile(dialog, new File(['image'], 'frozen.png', { type: 'image/png' }))
    await uploadSelectedFile(dialog)
    await loadPreviewImage(dialog)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.state.doc.firstChild?.type.name).toBe('image')
    expect(editor.state.doc.child(1).textContent).toBe('second')
  })

  it('marks the image toolbar button as active when an image is selected', () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)
    const button = wrapper.get('[data-test="rich-text-image"]')

    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('title')).toBe('编辑图片')
    expect(button.attributes('aria-label')).toBe('编辑图片')
  })

  it('replaces an existing image only after uploading and confirming a new candidate', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
      { upload },
    )
    editor.commands.setNodeSelection(0)
    const toolbar = mountControl(editor)

    await toolbar.get('[data-test="rich-text-image"]').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    await loadPreviewImage(dialog, 1000, 500)

    expect(dialog.find('[data-test="rich-text-image-file"]').exists()).toBe(true)
    expect(dialog.find('[data-test="rich-text-image-drop-zone"]').exists()).toBe(true)

    const replacement = new File(['replacement'], 'replacement.png', { type: 'image/png' })
    await chooseFile(dialog, replacement)
    expect(upload).not.toHaveBeenCalled()
    await uploadSelectedFile(dialog)
    await loadPreviewImage(dialog, 1000, 1000)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(upload).toHaveBeenCalledWith(replacement)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            src: '/api/attachments/replacement.png/content',
            alt: '旧说明',
            width: 500,
            height: 500,
          },
        },
      ],
    })
  })

  it('ignores upload errors after cancellation', async () => {
    const pendingUpload = deferred<{ src: string }>()
    const onError = vi.fn()
    const editor = createEditor(undefined, {
      upload: vi.fn(() => pendingUpload.promise),
      onError,
    })
    const toolbar = mountControl(editor)

    await toolbar.get('[data-test="rich-text-image"]').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    await chooseFile(dialog, new File(['image'], 'cover.png', { type: 'image/png' }))
    await uploadSelectedFile(dialog)
    await dialog.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    expect(document.querySelector('[data-test="rich-text-image-cancel"]')).toBeNull()

    pendingUpload.reject(new Error('Upload failed'))
    await flushPromises()

    expect(onError).not.toHaveBeenCalled()
  })

  it('keeps slash deletion and confirmed insertion as two history events', async () => {
    const editor = createHistoryEditor(undefined, {
      upload: async () => ({ src: imageAttrs.src }),
    })
    expect(openImageFromSlash(editor)).toBe(true)
    await flushPromises()

    const dialog = new DOMWrapper(document.body)
    await chooseFile(dialog, new File(['image'], 'context.png', { type: 'image/png' }))
    await uploadSelectedFile(dialog)
    await loadPreviewImage(dialog, imageAttrs.width, imageAttrs.height)
    await dialog.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.doc.firstChild?.type.name).toBe('image')

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/图片')
  })

  it('cancels slash insertion without adding a second history event', async () => {
    const editor = createHistoryEditor()
    expect(openImageFromSlash(editor)).toBe(true)
    await flushPromises()

    await new DOMWrapper(document.body).get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/图片')
  })

  it('closes the dialog when its editor is destroyed', async () => {
    const editor = createEditor()

    const toolbar = mountControl(editor)
    await toolbar.get('[data-test="rich-text-image"]').trigger('click')
    await flushPromises()
    expect(document.querySelector('[data-test="rich-text-image-cancel"]')).not.toBeNull()

    editor.destroy()
    await flushPromises()

    expect(document.querySelector('[data-test="rich-text-image-cancel"]')).toBeNull()
  })
})

describe('image editor paste', () => {
  it('opens one prefilled dialog for the first pasted image file', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createImagePasteEditor(upload)
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })

    const event = dispatchEditorPaste(editor, [
      new File(['text'], 'note.txt', { type: 'text/plain' }),
      imageFile,
    ])
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    const dialog = new DOMWrapper(document.body)
    expect(dialog.find('[data-test="rich-text-image-dialog-content"]').exists()).toBe(true)

    await uploadSelectedFile(dialog)

    expect(upload).toHaveBeenCalledWith(imageFile)
    await dialog.get('[data-test="rich-text-image-cancel"]').trigger('click')
  })

  it('does not open a dialog for internal rich-text HTML', async () => {
    const editor = createImagePasteEditor(async () => ({ src: '/api/attachments/image/content' }))
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })

    const event = dispatchEditorPaste(
      editor,
      [imageFile],
      '<img data-pm-slice="0 0 []" src="data:image/png;base64,aGVsbG8=" />',
    )
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector('[data-test="rich-text-image-dialog-content"]')).toBeNull()
    expect(editor.getJSON().content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
    )
  })

  it('removes images from external HTML before the editor parses it', async () => {
    const editor = createImagePasteEditor(async () => ({ src: '/api/attachments/image/content' }))

    const event = dispatchEditorPaste(
      editor,
      [],
      '<p>保留<img src="https://example.com/external.png" />文字</p>',
    )
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    expect(editor.getText()).toContain('保留文字')
    expect(editor.getHTML()).not.toContain('https://example.com/external.png')
  })
})

describe('ImageDialog', () => {
  it('exposes an accessible dialog name and a native file input', () => {
    const wrapper = mountDialog()

    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('图片')
    expect(wrapper.get('[data-test="rich-text-image-file-input"]').attributes()).toMatchObject({
      type: 'file',
      accept: 'image/*',
    })
  })

  it('keeps the selected candidate until the uploaded image loads successfully', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const wrapper = mountDialog(upload)

    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))

    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(getPreviewImageSrc(wrapper)).toBe('blob:cover')

    await uploadSelectedFile(wrapper)

    expect(revokeObjectUrl).not.toHaveBeenCalled()
    expect(getPreviewImageSrc(wrapper)).toBe('/api/attachments/cover.png/content')

    await loadPreviewImage(wrapper)

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cover')
    expect(getPreviewImageSrc(wrapper)).toBe('/api/attachments/cover.png/content')
  })

  it('uses dropped images as insert candidates without uploading immediately', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const wrapper = mountDialog(upload)
    const imageFile = new File(['image'], 'dropped.png', { type: 'image/png' })

    await dropFiles([imageFile, new File(['text'], 'note.txt', { type: 'text/plain' })])

    expect(upload).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()

    await uploadSelectedFile(wrapper)

    expect(upload).toHaveBeenCalledWith(imageFile)
  })

  it('uses pasted images from its content root as insert candidates', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const wrapper = mountDialog(upload)
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })

    const event = await pasteFiles(
      [imageFile],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )

    expect(event.defaultPrevented).toBe(true)
    expect(upload).not.toHaveBeenCalled()

    await uploadSelectedFile(wrapper)

    expect(upload).toHaveBeenCalledWith(imageFile)
  })

  it('does not handle pasted images from dialog input fields', async () => {
    const upload = vi.fn(async () => ({ src: '/api/attachments/pasted/content' }))
    const wrapper = mountDialog(upload)

    const event = await pasteFiles(
      [new File(['image'], 'pasted.png', { type: 'image/png' })],
      wrapper.get('[data-test="rich-text-image-alt"] input').element,
    )

    expect(event.defaultPrevented).toBe(false)
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('ignores consumed paste events and paste events outside the dialog root', async () => {
    const wrapper = mountDialog()
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })
    const root = wrapper.get('[data-test="rich-text-image-dialog-content"]').element

    const consumedEvent = await pasteFiles([imageFile], root, { defaultPrevented: true })

    expect(consumedEvent.defaultPrevented).toBe(true)
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()

    const outsideEvent = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(outsideEvent, 'clipboardData', {
      value: createClipboardData(imageFile),
    })
    window.dispatchEvent(outsideEvent)
    await nextTick()

    expect(outsideEvent.defaultPrevented).toBe(false)
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('initializes an insert candidate from an editor-pasted image file', () => {
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })
    const wrapper = mountDialog(vi.fn(), vi.fn(), undefined, imageFile)

    expect(wrapper.find('[data-test="rich-text-image-preview"]').exists()).toBe(true)
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()
  })

  it('initializes a replacement candidate from an editor-pasted image file', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:replacement')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const imageFile = new File(['image'], 'replacement.png', { type: 'image/png' })
    const upload = vi.fn(async () => ({
      src: '/api/attachments/replacement/content',
    }))
    const wrapper = mountDialog(
      upload,
      vi.fn(),
      {
        src: '/api/attachments/original/content',
        alt: '原说明',
        width: 480,
        height: 240,
      },
      imageFile,
    )

    expect(getPreviewImageSrc(wrapper)).toBe('blob:replacement')
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()

    await uploadSelectedFile(wrapper)
    expect(upload).toHaveBeenCalledWith(imageFile)
    await loadPreviewImage(wrapper, 800, 800)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/api/attachments/replacement/content',
      alt: '原说明',
      width: 480,
      height: 480,
    })
  })

  it('lets an edit dialog replace its candidate through drop or scoped paste before upload', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const wrapper = mountDialog(upload, vi.fn(), {
      src: '/api/attachments/original/content',
      alt: '原说明',
      width: 480,
      height: 240,
    })
    await loadPreviewImage(wrapper, 960, 480)

    await dropFiles([new File(['first'], 'dropped.png', { type: 'image/png' })])
    const pastedFile = new File(['second'], 'pasted.png', { type: 'image/png' })
    const event = await pasteFiles(
      [pastedFile],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )

    expect(event.defaultPrevented).toBe(true)
    await uploadSelectedFile(wrapper)

    expect(upload).toHaveBeenCalledWith(pastedFile)
    await loadPreviewImage(wrapper, 800, 400)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/api/attachments/pasted.png/content',
      alt: '原说明',
      width: 480,
      height: 240,
    })
  })

  it('keeps insert dialog cancellation from uploading or confirming an image', async () => {
    const upload = vi.fn(async () => ({ src: '/api/attachments/cover/content' }))
    const wrapper = mountDialog(upload)

    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('cancel')?.at(-1)).toEqual([])
  })

  it('reports upload errors and does not confirm an image', async () => {
    const uploadError = new Error('Upload failed')
    const upload = vi.fn(async () => {
      throw uploadError
    })
    const onError = vi.fn()
    const wrapper = mountDialog(upload, onError)

    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)

    expect(onError).toHaveBeenCalledWith(uploadError)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('keeps the insert candidate when its upload fails', async () => {
    const uploadError = new Error('Upload failed')
    const upload = vi.fn(async () => {
      throw uploadError
    })
    const onError = vi.fn()
    const wrapper = mountDialog(upload, onError)

    const imageFile = new File(['second'], 'second.png', { type: 'image/png' })
    await chooseFile(wrapper, imageFile)
    await uploadSelectedFile(wrapper)

    expect(onError).toHaveBeenCalledWith(uploadError)
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()

    await uploadSelectedFile(wrapper)

    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenLastCalledWith(imageFile)
  })

  it('reports natural size errors while keeping the candidate available for retry', async () => {
    const onError = vi.fn()
    const wrapper = mountDialog(
      vi.fn(async () => ({ src: '/api/attachments/broken/content' })),
      onError,
    )

    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await loadPreviewImage(wrapper, 0, 0)

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('reports image load errors while keeping the candidate available for retry', async () => {
    const onError = vi.fn()
    const wrapper = mountDialog(
      vi.fn(async () => ({ src: '/api/attachments/broken/content' })),
      onError,
    )

    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await failPreviewImage(wrapper)

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('replaces a loading remote candidate without accepting its stale image events', async () => {
    const uploadResult = deferred<{ src: string }>()
    const firstSrc = '/api/attachments/first.png/content'
    const secondSrc = '/api/attachments/second.png/content'
    const upload = vi
      .fn()
      .mockReturnValueOnce(uploadResult.promise)
      .mockResolvedValueOnce({ src: secondSrc })
    const wrapper = mountDialog(upload)

    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)

    expect(wrapper.get('[data-test="rich-text-image-file"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()

    const pastedEvent = await pasteFiles(
      [new File(['second'], 'second.png', { type: 'image/png' })],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )

    expect(pastedEvent.defaultPrevented).toBe(false)

    uploadResult.resolve({ src: firstSrc })
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-image-file"]').attributes('disabled')).toBeUndefined()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()

    const replacementEvent = await pasteFiles(
      [new File(['second'], 'second.png', { type: 'image/png' })],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )

    expect(replacementEvent.defaultPrevented).toBe(true)
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()

    await uploadSelectedFile(wrapper)

    const preview = wrapper.get('[data-test="rich-text-image-preview"] img')
    preview.element.setAttribute('src', firstSrc)
    Object.defineProperty(preview.element, 'naturalWidth', { configurable: true, value: 100 })
    Object.defineProperty(preview.element, 'naturalHeight', { configurable: true, value: 100 })
    await preview.trigger('load')

    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()

    preview.element.setAttribute('src', secondSrc)
    await loadPreviewImage(wrapper, 800, 400)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: secondSrc,
      alt: 'second.png',
      width: 800,
      height: 400,
    })
  })

  it('updates existing image attrs with a fixed ratio', async () => {
    const wrapper = mountEditDialog({
      src: '/api/attachments/cover/content',
      alt: '旧说明',
      width: 500,
      height: 250,
    })

    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('新说明')
    const widthInput = wrapper.get('[data-test="rich-text-image-width"] input')
    await widthInput.setValue('600')
    await widthInput.trigger('blur')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/api/attachments/cover/content',
      alt: '新说明',
      width: 600,
      height: 300,
    })
  })

  it('fills a missing existing image height from its natural ratio', async () => {
    const wrapper = mountEditDialog({
      src: '/api/attachments/cover/content',
      alt: '说明',
      width: 500,
      height: null,
    })

    await loadPreviewImage(wrapper, 1000, 500)

    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeUndefined()

    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      width: 500,
      height: 250,
    })
  })

  it('fills a missing existing image width from its natural ratio', async () => {
    const wrapper = mountEditDialog({
      src: '/api/attachments/cover/content',
      alt: '说明',
      width: null,
      height: 250,
    })

    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      width: 500,
      height: 250,
    })
  })

  it('uses the replacement natural size when the existing image has no display width', async () => {
    const upload = vi.fn(async () => ({ src: '/api/attachments/replacement/content' }))
    const wrapper = mountDialog(upload, vi.fn(), {
      src: '/api/attachments/original/content',
      alt: '原说明',
      width: null,
      height: 250,
    })
    await loadPreviewImage(wrapper, 1000, 500)

    await chooseFile(wrapper, new File(['image'], 'replacement.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await loadPreviewImage(wrapper, 800, 400)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/api/attachments/replacement/content',
      alt: '原说明',
      width: 800,
      height: 400,
    })
  })

  it('keeps calculated image dimensions positive for extreme aspect ratios', async () => {
    const wrapper = mountEditDialog({
      src: '/api/attachments/cover/content',
      alt: '说明',
      width: 1,
      height: null,
    })

    await loadPreviewImage(wrapper, 1000, 1)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      width: 1,
      height: 1,
    })
  })

  it('clears alt when an existing image description is cleared', async () => {
    const wrapper = mountEditDialog({
      src: '/api/attachments/cover/content',
      alt: '旧说明',
      width: 500,
      height: 250,
    })

    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      alt: '',
    })
  })

  it('keeps dimension fields disabled until natural size finishes loading', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const wrapper = mountDialog(upload)

    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)

    expect(
      wrapper.get('[data-test="rich-text-image-width"] input').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()

    await loadPreviewImage(wrapper, 1000, 500)
    const widthInput = wrapper.get('[data-test="rich-text-image-width"] input')
    await widthInput.setValue('600')
    await widthInput.trigger('blur')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      width: 600,
      height: 300,
    })
  })
})
