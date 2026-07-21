import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NImage, NSpin } from 'naive-ui'
import { defineComponent, h, markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageFeature, type RichTextImageNodeAttrs } from '../../../../src/features/image/shared'
import ImageDialog from '../../../../src/features/image/vue/ImageDialog.vue'
import ImageDialogHost from '../../../../src/features/image/vue/ImageDialogHost.vue'
import ImageToolbarControl from '../../../../src/features/image/vue/ImageToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'
import { createTestRichTextOverlayState } from '../../../helpers/overlay'

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
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...imageFeature.documentExtensions!()],
    content,
  })
}

function mountControl(editor: Editor, upload = vi.fn(), onError = vi.fn()) {
  const overlay = createTestRichTextOverlayState()
  const Harness = defineComponent({
    setup: () => () =>
      h('div', [
        h(ImageToolbarControl, {
          editor: markRaw(editor),
          disabled: false,
          upload,
          onError,
        }),
        h(ImageDialogHost, {
          editor: markRaw(editor),
          disabled: false,
        }),
      ]),
  })

  return mount(Harness, {
    global: {
      provide: overlay.provide,
      stubs: {
        teleport: true,
      },
    },
  })
}

function mountDialog(
  upload = vi.fn(),
  onError = vi.fn(),
  existingAttrs?: RichTextImageNodeAttrs,
  show = true,
) {
  let wrapper!: ReturnType<typeof mount>
  wrapper = mount(ImageDialog, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      show,
      upload,
      onError,
      existingAttrs,
      'onUpdate:show': (show: boolean) => wrapper.setProps({ show }),
    },
  })

  return wrapper
}

async function mountExistingImageDialog(existingAttrs: RichTextImageNodeAttrs) {
  const wrapper = mountDialog(vi.fn(), vi.fn(), existingAttrs, false)
  await wrapper.setProps({ show: true })

  return wrapper
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
  // Partial DOM mock with only the fields used by the paste handler.
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

describe('ImageToolbarControl', () => {
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
})

describe('ImageDialog', () => {
  it('shows a local preview before upload and replaces it with the uploaded image', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const wrapper = mountDialog(upload)

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

  it('uses pasted images as insert candidates when the insert dialog is open', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const wrapper = mountDialog(upload)
    const imageFile = new File(['image'], 'pasted.png', { type: 'image/png' })

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
    const wrapper = mountDialog(upload)

    const { preventDefault } = await pasteFiles(
      [new File(['image'], 'pasted.png', { type: 'image/png' })],
      wrapper.get('[data-test="rich-text-image-alt"] input').element,
    )

    expect(preventDefault).not.toHaveBeenCalled()
    expect(
      wrapper.get('[data-test="rich-text-image-upload-action"]').attributes('disabled'),
    ).toBeDefined()
  })

  it('keeps insert dialog cancellation from uploading or confirming an image', async () => {
    const upload = vi.fn(async () => ({ src: '/api/attachments/cover/content' }))
    const wrapper = mountDialog(upload)

    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    expect(upload).not.toHaveBeenCalled()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:show')?.at(-1)).toEqual([false])
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
    const wrapper = mountDialog(upload, onError)

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

    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('reports natural size errors and keeps insert confirmation disabled', async () => {
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
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('reports image load errors and keeps insert confirmation disabled', async () => {
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
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('keeps file selection disabled while upload is pending', async () => {
    const uploadResult = deferred<{ src: string }>()
    const upload = vi.fn(() => uploadResult.promise)
    const wrapper = mountDialog(upload)

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
    const wrapper = mountDialog(upload)

    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    await wrapper.setProps({ show: true })
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
    const wrapper = mountDialog(
      vi.fn(() => pendingUpload.promise),
      onError,
    )

    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await uploadSelectedFile(wrapper)
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    pendingUpload.reject(new Error('Upload failed'))
    await flushPromises()

    expect(onError).not.toHaveBeenCalled()
  })

  it('updates existing image attrs with a fixed ratio', async () => {
    const wrapper = await mountExistingImageDialog({
      src: '/api/attachments/cover/content',
      alt: '旧说明',
      width: 500,
      height: 250,
    })

    await loadPreviewImage(wrapper, 1000, 500)
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('新说明')
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
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
    const wrapper = await mountExistingImageDialog({
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
    const wrapper = await mountExistingImageDialog({
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

  it('keeps calculated image dimensions positive for extreme aspect ratios', async () => {
    const wrapper = await mountExistingImageDialog({
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
    const wrapper = await mountExistingImageDialog({
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
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      width: 600,
      height: 300,
    })
  })
})
