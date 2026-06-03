import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import ImageToolbarControl from '../../../../src/features/image/vue/ImageToolbarControl.vue'

const editors: Editor[] = []
const wrappers: Array<ReturnType<typeof mount>> = []

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

function mountControl(editor: Editor, upload = vi.fn()) {
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
})
