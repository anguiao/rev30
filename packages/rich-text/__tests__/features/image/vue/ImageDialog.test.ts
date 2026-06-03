import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { NSpin } from 'naive-ui'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import ImageToolbarControl from '../../../../src/features/image/vue/ImageToolbarControl.vue'

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

function mockImageSize(width = 800, height = 450) {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width
      naturalHeight = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    },
  )
}

function mockDelayedImageSize(width = 800, height = 450) {
  const images: Array<{ onload: (() => void) | null }> = []

  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width
      naturalHeight = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        images.push(this)
      }
    },
  )

  return {
    async load() {
      for (const image of images) {
        image.onload?.()
      }
      await flushPromises()
    },
  }
}

function mockStalledImageSize() {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {}
    },
  )
}

function mockImageSizeFailure() {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    },
  )
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

async function chooseFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.get('[data-test="rich-text-image-file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [file],
  })
  await input.trigger('change')
  await flushPromises()
}

describe('ImageToolbarControl', () => {
  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount()
    while (editors.length > 0) editors.pop()?.destroy()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uploads inside the insert dialog and inserts the image after confirmation', async () => {
    mockImageSize()
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
      alt: file.name,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
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

  it('keeps insert dialog cancellation from changing the editor', async () => {
    mockImageSize()
    const editor = createEditor()
    const wrapper = mountControl(
      editor,
      vi.fn(async () => ({ src: '/api/attachments/cover/content', alt: 'cover.png' })),
    )

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('reports upload errors and does not insert an image', async () => {
    mockImageSize()
    const uploadError = new Error('Upload failed')
    const upload = vi.fn(async () => {
      throw uploadError
    })
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(editor, upload, onError)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(onError).toHaveBeenCalledWith(uploadError)
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('clears the insert candidate when a newer file upload fails', async () => {
    mockImageSize()
    const uploadError = new Error('Upload failed')
    const upload = vi.fn((file: File) =>
      file.name === 'first.png'
        ? Promise.resolve({
            src: '/api/attachments/first.png/content',
            alt: 'first.png',
          })
        : Promise.reject(uploadError),
    )
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(editor, upload, onError)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeUndefined()

    await chooseFile(wrapper, new File(['second'], 'second.png', { type: 'image/png' }))
    await flushPromises()

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
    mockImageSizeFailure()
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(
      editor,
      vi.fn(async () => ({ src: '/api/attachments/broken/content', alt: 'broken.png' })),
      onError,
    )

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'broken.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('clears stale size loading when a newer file upload fails', async () => {
    mockStalledImageSize()
    const uploadError = new Error('Upload failed')
    const upload = vi.fn((file: File) =>
      file.name === 'first.png'
        ? Promise.resolve({
            src: '/api/attachments/first.png/content',
            alt: 'first.png',
          })
        : Promise.reject(uploadError),
    )
    const onError = vi.fn()
    const editor = createEditor()
    const wrapper = mountControl(editor, upload, onError)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    expect(wrapper.findComponent(NSpin).props('show')).toBe(true)

    await chooseFile(wrapper, new File(['second'], 'second.png', { type: 'image/png' }))
    await flushPromises()

    expect(onError).toHaveBeenCalledWith(uploadError)
    expect(wrapper.findComponent(NSpin).props('show')).toBe(false)
  })

  it('ignores stale upload results after another file is selected', async () => {
    mockImageSize()
    const firstUpload = deferred<{ src: string; alt: string }>()
    const upload = vi.fn((file: File) =>
      file.name === 'first.png'
        ? firstUpload.promise
        : Promise.resolve({
            src: `/api/attachments/${file.name}/content`,
            alt: file.name,
          }),
    )
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['first'], 'first.png', { type: 'image/png' }))
    await chooseFile(wrapper, new File(['second'], 'second.png', { type: 'image/png' }))

    firstUpload.resolve({
      src: '/api/attachments/first.png/content',
      alt: 'first.png',
    })
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON().content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image',
          attrs: expect.objectContaining({
            src: '/api/attachments/second.png/content',
            alt: 'second.png',
          }),
        }),
      ]),
    )
    expect(JSON.stringify(editor.getJSON())).not.toContain('first.png')
  })

  it('updates existing image attrs in edit mode with a fixed ratio', async () => {
    mockImageSize(1000, 500)
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
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

  it('does not allow uploading a replacement while editing an existing image', async () => {
    mockImageSize(1000, 500)
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
      alt: file.name,
    }))
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')

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
    mockImageSize(1000, 500)
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />',
    )
    editor.commands.setNodeSelection(0)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
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

  it('normalizes dimensions entered before natural size finishes loading', async () => {
    const image = mockDelayedImageSize(1000, 500)
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
      alt: file.name,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
    await wrapper.get('[data-test="rich-text-image-height"] input').setValue('100')
    await image.load()
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
