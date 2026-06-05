import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { NImage, NSpin } from 'naive-ui'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import ImageToolbarControl from '../../../../src/features/image/vue/ImageToolbarControl.vue'

type FileDialogChangeHandler = (files: FileList | null) => void

const fileDialog = vi.hoisted(() => ({
  changeHandlers: [] as FileDialogChangeHandler[],
  open: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('@vueuse/core', async (importOriginal) => {
  const vueuse = await importOriginal<typeof import('@vueuse/core')>()

  return {
    ...vueuse,
    useFileDialog: vi.fn(() => ({
      files: { value: null },
      open: fileDialog.open,
      reset: fileDialog.reset,
      onChange: (handler: FileDialogChangeHandler) => {
        fileDialog.changeHandlers.push(handler)
      },
    })),
  }
})

const editors: Editor[] = []
const wrappers: Array<ReturnType<typeof mount>> = []

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
  const element = document.createElement('div')
  document.body.appendChild(element)
  const extension = imageFeature.extension()

  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(extension) ? extension : [extension]),
    ],
    content,
  })
  editors.push(editor)

  return editor
}

function mountControl(editor: Editor, upload = vi.fn(), onError = vi.fn()) {
  const wrapper = mount(ImageToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: markRaw(editor),
      disabled: false,
      accept: 'image/*',
      upload,
      onError,
    },
  })
  wrappers.push(wrapper)

  return wrapper
}

function createFileList(file: File) {
  return {
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  } as FileList
}

async function chooseFile(_wrapper: ReturnType<typeof mount>, file: File) {
  const onChange = fileDialog.changeHandlers.at(-1)
  if (onChange === undefined) {
    throw new Error('File dialog change handler is not registered')
  }

  onChange(createFileList(file))
  await flushPromises()
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
    while (wrappers.length > 0) wrappers.pop()?.unmount()
    while (editors.length > 0) editors.pop()?.destroy()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fileDialog.changeHandlers.length = 0
    fileDialog.open.mockClear()
    fileDialog.reset.mockClear()
  })

  it('uploads the selected file manually and inserts the image after confirmation', async () => {
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await wrapper.get('[data-test="rich-text-image-file"]').trigger('click')
    expect(fileDialog.open).toHaveBeenCalledWith({ accept: 'image/*' })
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
