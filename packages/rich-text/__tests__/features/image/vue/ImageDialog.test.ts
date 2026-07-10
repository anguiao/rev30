import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NImage, NSpin } from 'naive-ui'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import ImageToolbarControl from '../../../../src/features/image/vue/ImageToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

type FileDialogChangeHandler = (files: FileList | null) => void
type FileDialogOptions = {
  accept?: string
  multiple?: boolean
  reset?: boolean
}
type DropZoneOptions = {
  onDrop?: (files: File[] | null, event: DragEvent) => void
}
type PasteHandler = (event: ClipboardEvent) => void

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
const eventListeners = vi.hoisted(() => ({
  pasteHandlers: [] as PasteHandler[],
}))

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
    useEventListener: vi.fn((_target: unknown, event: string, handler: PasteHandler) => {
      if (event === 'paste') {
        eventListeners.pasteHandlers.push(handler)
      }

      return vi.fn()
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

function createEditor(content = '<p>维护通知</p>') {
  const extension = imageFeature.extension()

  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(extension) ? extension : [extension]),
    ],
    content,
  })
}

function mountControl(editor: Editor, upload = vi.fn(), onError = vi.fn()) {
  return mount(ImageToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: markRaw(editor),
      disabled: false,
      upload,
      onError,
    },
  })
}

function createFileList(...files: File[]) {
  return Object.assign(files, {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList
}

function createDataTransferItems(...files: File[]) {
  const items = files.map((file) => ({
    kind: 'file',
    type: file.type,
    getAsFile: () => file,
  }))

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

async function chooseFile(_wrapper: ReturnType<typeof mount>, file: File) {
  const onChange = fileDialog.changeHandlers.at(-1)
  if (onChange === undefined) {
    throw new Error('File dialog change handler is not registered')
  }

  onChange(createFileList(file))
  await flushPromises()
}

async function dropFiles(files: File[]) {
  const onDrop = dropZone.options.at(-1)?.onDrop
  if (onDrop === undefined) {
    throw new Error('Drop zone handler is not registered')
  }

  onDrop(files, new Event('drop') as DragEvent)
  await flushPromises()
}

async function pasteFiles(files: File[], target: EventTarget | null) {
  const onPaste = eventListeners.pasteHandlers.at(-1)
  if (onPaste === undefined) {
    throw new Error('Paste handler is not registered')
  }

  const preventDefault = vi.fn()
  onPaste({
    clipboardData: createClipboardData(...files),
    preventDefault,
    target,
  } as unknown as ClipboardEvent)
  await flushPromises()

  return { preventDefault }
}

async function uploadSelectedFile(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="rich-text-image-upload-action"]').trigger('click')
  await flushPromises()
}

async function loadPreviewImage(wrapper: ReturnType<typeof mount>, width = 800, height = 450) {
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
  await flushPromises()
}

async function failPreviewImage(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="rich-text-image-preview"] img').trigger('error')
  await flushPromises()
}

describe('ImageToolbarControl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    fileDialog.changeHandlers.length = 0
    fileDialog.options.length = 0
    fileDialog.open.mockClear()
    fileDialog.reset.mockClear()
    dropZone.options.length = 0
    dropZone.isOverDropZone.value = false
    eventListeners.pasteHandlers.length = 0
  })

  it('uploads the selected file manually and inserts the image after confirmation', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    expect(fileDialog.options.at(-1)).toMatchObject({
      accept: 'image/*',
      multiple: false,
      reset: true,
    })
    await wrapper.get('[data-test="rich-text-image-file"]').trigger('click')
    expect(fileDialog.open).toHaveBeenCalledWith()
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    expect(upload).not.toHaveBeenCalled()
    await loadPreviewImage(wrapper)
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()

    await uploadSelectedFile(wrapper)
    await loadPreviewImage(wrapper)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
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

  it('shows a local preview before upload and replaces it with the uploaded image', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))

    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(wrapper.getComponent(NImage).props('src')).toBe('blob:cover')

    await uploadSelectedFile(wrapper)

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cover')
    expect(wrapper.getComponent(NImage).props('src')).toBe('/api/attachments/cover.png/content')
  })

  it('uses dropped images as insert candidates without uploading immediately', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)
    const imageFile = new File(['image'], 'dropped.png', { type: 'image/png' })

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await dropFiles([imageFile, new File(['text'], 'note.txt', { type: 'text/plain' })])

    expect(upload).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeUndefined()

    await uploadSelectedFile(wrapper)

    expect(upload).toHaveBeenCalledWith(imageFile)
  })

  it('uses pasted images as insert candidates when the insert dialog is open', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    const { preventDefault } = await pasteFiles(
      [imageFile],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(upload).not.toHaveBeenCalled()

    await uploadSelectedFile(wrapper)

    expect(upload).toHaveBeenCalledWith(imageFile)
  })

  it('does not handle pasted images from dialog input fields', async () => {
    const upload = vi.fn(async () => ({ src: '/api/attachments/pasted/content' }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    const { preventDefault } = await pasteFiles(
      [new File(['image'], 'pasted.png', { type: 'image/png' })],
      wrapper.get('[data-test="rich-text-image-alt"] input').element,
    )

    expect(preventDefault).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('keeps insert dialog cancellation from uploading or changing the editor', async () => {
    const upload = vi.fn(async () => ({ src: '/api/attachments/cover/content' }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('reports upload errors and does not insert an image', async () => {
    const uploadError = new Error('Upload failed')
    const upload = vi.fn(async () => {
      throw uploadError
    })
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(editor, upload, onError)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)

    expect(onError).toHaveBeenCalledWith(uploadError)
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('clears the insert candidate when a newer file upload fails', async () => {
    const uploadError = new Error('Upload failed')
    const upload = vi.fn((file: File) =>
      file.name === 'first.png'
        ? Promise.resolve({
            src: '/api/attachments/first.png/content',
          })
        : Promise.reject(uploadError),
    )
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(editor, upload, onError)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await loadPreviewImage(wrapper)
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeUndefined()

    await chooseFile(wrapper, new File(['second'], 'second.png', { type: 'image/png' }))
    expect(upload).toHaveBeenCalledOnce()
    await uploadSelectedFile(wrapper)

    expect(onError).toHaveBeenCalledWith(uploadError)
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('first.png')
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('reports natural size errors and keeps insert confirmation disabled', async () => {
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(
      editor,
      vi.fn(async () => ({ src: '/api/attachments/broken/content' })),
      onError,
    )

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await loadPreviewImage(wrapper, 0, 0)

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('reports image load errors and keeps insert confirmation disabled', async () => {
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(
      editor,
      vi.fn(async () => ({ src: '/api/attachments/broken/content' })),
      onError,
    )

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await failPreviewImage(wrapper)

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('keeps file selection disabled while upload is pending', async () => {
    const uploadResult = deferred<{ src: string }>()
    const upload = vi.fn(() => uploadResult.promise)
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)

    expect(wrapper.get('[data-test="rich-text-image-file"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()

    uploadResult.resolve({
      src: '/api/attachments/first.png/content',
    })
    await flushPromises()

    expect(wrapper.findComponent(NSpin).props('show')).toBe(false)
    expect(wrapper.get('[data-test="rich-text-image-file"]').attributes('disabled')).toBeUndefined()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('does not let an earlier upload overwrite a newer dialog upload', async () => {
    const firstUpload = deferred<{ src: string }>()
    const secondUpload = deferred<{ src: string }>()
    const upload = vi.fn((file: File) =>
      file.name === 'first.png' ? firstUpload.promise : secondUpload.promise,
    )
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['second'], 'second.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    secondUpload.resolve({ src: '/api/attachments/second.png/content' })
    await flushPromises()

    expect(wrapper.getComponent(NImage).props('src')).toBe('/api/attachments/second.png/content')

    firstUpload.resolve({ src: '/api/attachments/first.png/content' })
    await flushPromises()

    expect(wrapper.getComponent(NImage).props('src')).toBe('/api/attachments/second.png/content')
  })

  it('ignores upload errors after the dialog closes', async () => {
    const pendingUpload = deferred<{ src: string }>()
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(
      editor,
      vi.fn(() => pendingUpload.promise),
      onError,
    )

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    pendingUpload.reject(new Error('Upload failed'))
    await flushPromises()

    expect(onError).not.toHaveBeenCalled()
  })

  it('updates existing image attrs with a fixed ratio', async () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('新说明')
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            alt: '新说明',
            width: 600,
            height: 300,
          },
        },
      ],
    })
  })

  it('fills a missing existing image height from its natural ratio', async () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="说明" width="500" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await loadPreviewImage(wrapper, 1000, 500)

    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeUndefined()

    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            width: 500,
            height: 250,
          },
        },
      ],
    })
  })

  it('fills a missing existing image width from its natural ratio', async () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="说明" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            width: 500,
            height: 250,
          },
        },
      ],
    })
  })

  it('keeps calculated image dimensions positive for extreme aspect ratios', async () => {
    const editor = createEditor('<img src="/api/attachments/cover/content" alt="说明" width="1" />')
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await loadPreviewImage(wrapper, 1000, 1)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            width: 1,
            height: 1,
          },
        },
      ],
    })
  })

  it('marks the image toolbar button as active when an image is selected', () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)
    const button = wrapper.get('[data-test="rich-text-image"]')

    expect(button.attributes('data-active')).toBe('true')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('title')).toBe('编辑图片')
    expect(button.attributes('aria-label')).toBe('编辑图片')
  })

  it('does not allow uploading a replacement for an existing image', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await loadPreviewImage(wrapper, 1000, 500)

    expect(wrapper.find('[data-test="rich-text-image-file"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rich-text-image-drop-zone"]').exists()).toBe(false)

    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('编辑说明')
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            src: '/api/attachments/cover/content',
            alt: '编辑说明',
            width: 600,
            height: 300,
          },
        },
      ],
    })
  })

  it('clears alt when an existing image description is cleared', async () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            alt: '',
          },
        },
      ],
    })
  })

  it('does not keep image title attrs when parsing or updating images', async () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="说明" title="标题" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)

    expect(editor.getAttributes('image')).not.toHaveProperty('title')
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: expect.not.objectContaining({
            title: expect.anything(),
          }),
        },
      ],
    })

    editor.commands.updateAttributes('image', { title: '新标题', alt: '新说明' })

    expect(editor.getAttributes('image')).toMatchObject({
      alt: '新说明',
    })
    expect(editor.getAttributes('image')).not.toHaveProperty('title')
  })

  it('keeps dimension fields disabled until natural size finishes loading', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)

    expect(
      wrapper.get('[data-test="rich-text-image-width"] input').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()

    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON().content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          attrs: expect.objectContaining({
            width: 600,
            height: 300,
          }),
        }),
      ]),
    )
  })
})
