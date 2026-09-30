import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { UseDropZoneOptions, UseFileDialogOptions } from '@vueuse/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageDialog from '../../../../../src/features/image/client/vue/ImageDialog.vue'
import { createClipboardEvent, createFileList } from '../../../../helpers/clipboard'

type FileDialogChangeHandler = (files: FileList | null) => void
const picker = vi.hoisted(() => ({
  open: vi.fn(),
  fileOptions: [] as UseFileDialogOptions[],
  fileChanges: [] as FileDialogChangeHandler[],
  dropOptions: [] as UseDropZoneOptions[],
}))
const objectUrls = { create: vi.fn(), revoke: vi.fn() }

vi.mock('@vueuse/core', async (importOriginal) => {
  const vueuse = await importOriginal<typeof import('@vueuse/core')>()
  return {
    ...vueuse,
    useFileDialog: vi.fn((options: UseFileDialogOptions) => {
      picker.fileOptions.push(options)
      return {
        files: { value: null },
        open: picker.open,
        reset: vi.fn(),
        onChange: (handler: FileDialogChangeHandler) => picker.fileChanges.push(handler),
      }
    }),
    useDropZone: vi.fn((_target: unknown, options: UseDropZoneOptions) => {
      picker.dropOptions.push(options)
      return { files: { value: null }, isOverDropZone: { value: false } }
    }),
  }
})

class PreviewImage {
  static pending: PreviewImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  private value = ''

  set src(value: string) {
    this.value = value
    if (value !== '') PreviewImage.pending.push(this)
  }

  get src() {
    return this.value
  }

  static finish(src: string, width = 800, height = 400) {
    const image = PreviewImage.pending.find((entry) => entry.src === src)
    if (image === undefined) throw new Error(`No pending image: ${src}`)
    PreviewImage.pending.splice(PreviewImage.pending.indexOf(image), 1)
    image.naturalWidth = width
    image.naturalHeight = height
    image.onload?.()
  }

  static fail(src: string) {
    const image = PreviewImage.pending.find((entry) => entry.src === src)
    if (image === undefined) throw new Error(`No pending image: ${src}`)
    PreviewImage.pending.splice(PreviewImage.pending.indexOf(image), 1)
    image.onerror?.()
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function file(name: string) {
  return new File(['image'], name, { type: 'image/png' })
}

function mountDialog(
  options: {
    upload?: (file: File) => Promise<{ src: string }>
    listLibraryImages?: (query: { keyword?: string; page: number; pageSize: number }) => Promise<{
      list: { src: string; name: string }[]
      total: number
      page: number
      pageSize: number
    }>
    initialImageFiles?: File[]
    existingImage?: { src: string; alt: string | null; width: number | null; height: number | null }
    onError?: (error: unknown) => void
  } = {},
) {
  return mount(ImageDialog, {
    global: { stubs: { teleport: true } },
    props: { upload: options.upload ?? vi.fn(), ...options },
  })
}

function libraryResult(list: { src: string; name: string }[], page = 1, total = list.length) {
  return { list, total, page, pageSize: 20 }
}

async function selectSource(wrapper: ReturnType<typeof mountDialog>, label: string) {
  await wrapper.get('[data-test="rich-text-image-source"]').trigger('click')
  const option = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === label)
  expect(option).toBeDefined()
  await option!.trigger('click')
}

async function chooseFiles(files: File[]) {
  const change = picker.fileChanges.at(-1)
  if (change === undefined) throw new Error('File picker is not registered')
  change(createFileList(files))
  await nextTick()
}

async function dropFiles(files: File[]) {
  const onDrop = picker.dropOptions.at(-1)?.onDrop
  if (onDrop === undefined) throw new Error('Drop zone is not registered')
  onDrop(files, new DragEvent('drop'))
  await nextTick()
}

async function pasteFiles(files: File[], target: Element) {
  const event = createClipboardEvent({ files })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

beforeEach(() => {
  picker.open.mockReset()
  PreviewImage.pending = []
  let nextUrl = 0
  objectUrls.create.mockReset().mockImplementation(() => `blob:image-${++nextUrl}`)
  objectUrls.revoke.mockReset()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(objectUrls.create)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(objectUrls.revoke)
  vi.stubGlobal('Image', PreviewImage)
})

afterEach(() => {
  picker.fileOptions.length = 0
  picker.fileChanges.length = 0
  picker.dropOptions.length = 0
  vi.unstubAllGlobals()
})

describe('ImageDialog batch insertion', () => {
  it('starts empty, reads selected files locally and uploads only on final confirmation', async () => {
    const upload = vi.fn(async (selected: File) => ({ src: `/images/${selected.name}` }))
    const wrapper = mountDialog({ upload })
    expect(wrapper.text()).toContain('尚未选择图片')
    expect(
      wrapper.get('[role="listbox"][aria-label="已选图片"]').findAll('[role="option"]'),
    ).toHaveLength(0)
    expect(wrapper.find('[data-test="rich-text-image-alt"]').exists()).toBe(false)
    expect(picker.fileOptions.at(-1)).toMatchObject({ multiple: true, accept: 'image/*' })
    expect(wrapper.get('[data-test="rich-text-image-source"]').text()).toBe('添加图片')
    await selectSource(wrapper, '从本地选择')
    expect(picker.open).toHaveBeenCalledOnce()

    await chooseFiles([file('first.png'), file('second.png')])
    expect(PreviewImage.pending.map((image) => image.src)).toEqual(['blob:image-1', 'blob:image-2'])
    expect(upload).not.toHaveBeenCalled()
    PreviewImage.finish('blob:image-1', 600, 300)
    PreviewImage.finish('blob:image-2', 400, 400)
    await flushPromises()
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(2)
    expect(wrapper.get('[data-test="rich-text-image-confirm"]').text()).toContain('上传并插入 2 张')

    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    expect(upload.mock.calls.map(([selected]) => selected.name)).toEqual(['first.png'])
    PreviewImage.finish('/images/first.png', 300, 600)
    await flushPromises()
    expect(upload.mock.calls.map(([selected]) => selected.name)).toEqual([
      'first.png',
      'second.png',
    ])
    PreviewImage.finish('/images/second.png', 100, 100)
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toEqual([
      { src: '/images/first.png', alt: 'first.png', width: 600, height: 300 },
      { src: '/images/second.png', alt: 'second.png', width: 400, height: 400 },
    ])
  })

  it('rejects an over-limit addition as one operation and frees a slot after removal', async () => {
    const wrapper = mountDialog()
    await chooseFiles(Array.from({ length: 19 }, (_, index) => file(`${index}.png`)))
    expect(objectUrls.create).toHaveBeenCalledTimes(19)
    await chooseFiles([file('extra-a.png'), file('extra-b.png')])
    expect(objectUrls.create).toHaveBeenCalledTimes(19)
    expect(wrapper.text()).toContain('最多选择 20 张图片，还可添加 1 张')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(19)

    await wrapper.get('[data-test="rich-text-image-remove"]').trigger('click')
    await chooseFiles([file('extra-a.png'), file('extra-b.png'), file('extra-c.png')])
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(18)
    expect(wrapper.text()).toContain('最多选择 20 张图片，还可添加 2 张')
    await chooseFiles([file('extra-a.png'), file('extra-b.png')])
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(20)
    await chooseFiles([file('full.png')])
    expect(wrapper.text()).toContain('已选择 20 张图片，请先移除再添加')
  })

  it('keeps per-image properties and the candidate list when reordering and removing images', async () => {
    const wrapper = mountDialog()
    await chooseFiles([file('first.png'), file('second.png')])
    PreviewImage.finish('blob:image-1', 800, 400)
    PreviewImage.finish('blob:image-2', 400, 400)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('封面')
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
    await wrapper.get('[data-test="rich-text-image-width"] input').trigger('blur')
    await wrapper.findAll('[data-test="rich-text-image-candidate"]')[1]!.trigger('click')
    expect(
      (wrapper.get('[data-test="rich-text-image-alt"] input').element as HTMLInputElement).value,
    ).toBe('second.png')
    await wrapper.get('[data-test="rich-text-image-move-up"]').trigger('click')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')[0]!.text()).toContain(
      'second.png',
    )
    await wrapper.findAll('[data-test="rich-text-image-candidate"]')[1]!.trigger('click')
    expect(
      (wrapper.get('[data-test="rich-text-image-alt"] input').element as HTMLInputElement).value,
    ).toBe('封面')
    expect(
      (wrapper.get('[data-test="rich-text-image-width"] input').element as HTMLInputElement).value,
    ).toBe('600')
    await wrapper.get('[data-test="rich-text-image-remove"]').trigger('click')
    expect(
      wrapper.get('[data-test="rich-text-image-candidate-list"]').findAll('[role="option"]'),
    ).toHaveLength(1)
    expect(wrapper.find('[data-test="rich-text-image-move-up"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rich-text-image-move-down"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rich-text-image-preview"]').exists()).toBe(true)
    await wrapper.get('[data-test="rich-text-image-remove"]').trigger('click')
    expect(
      wrapper.get('[data-test="rich-text-image-candidate-list"]').findAll('[role="option"]'),
    ).toHaveLength(0)
    expect(wrapper.find('[aria-label="点击选择或拖入图片"]').exists()).toBe(true)
  })

  it('continues after upload failure, keeps successful results and retries only unfinished uploads', async () => {
    const upload = vi.fn(async (selected: File) => {
      if (selected.name === 'first.png' && upload.mock.calls.length === 1) throw new Error('failed')
      return { src: `/images/${selected.name}` }
    })
    const wrapper = mountDialog({ upload })
    await chooseFiles([file('first.png'), file('second.png')])
    PreviewImage.finish('blob:image-1')
    PreviewImage.finish('blob:image-2')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    PreviewImage.finish('/images/second.png')
    await flushPromises()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.text()).toContain('上传失败')
    expect(upload).toHaveBeenCalledTimes(2)
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    expect(upload).toHaveBeenCalledTimes(3)
    expect(upload.mock.calls[2]?.[0].name).toBe('first.png')
    PreviewImage.finish('/images/first.png')
    await flushPromises()
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject([
      { src: '/images/first.png' },
      { src: '/images/second.png' },
    ])
  })

  it('retries a failed uploaded URL read without uploading the file again', async () => {
    const upload = vi.fn(async () => ({ src: '/images/uploaded.png' }))
    const wrapper = mountDialog({ upload })
    await chooseFiles([file('uploaded.png')])
    PreviewImage.finish('blob:image-1')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    PreviewImage.fail('/images/uploaded.png')
    await flushPromises()
    expect(wrapper.text()).toContain('图片读取失败')
    await wrapper.get('[data-test="rich-text-image-retry"]').trigger('click')
    PreviewImage.finish('/images/uploaded.png')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    expect(upload).toHaveBeenCalledOnce()
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject([{ src: '/images/uploaded.png' }])
  })

  it('retries local preview reading without uploading', async () => {
    const upload = vi.fn()
    const wrapper = mountDialog({ upload })
    await chooseFiles([file('broken.png')])
    PreviewImage.fail('blob:image-1')
    await flushPromises()
    expect(wrapper.text()).toContain('图片读取失败')
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('[data-test="rich-text-image-retry"]').trigger('click')
    PreviewImage.finish('blob:image-1')
    await flushPromises()
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeUndefined()
    expect(upload).not.toHaveBeenCalled()
  })

  it('cancels during upload without starting another upload or inserting after a late result', async () => {
    const pending = deferred<{ src: string }>()
    const upload = vi.fn().mockReturnValueOnce(pending.promise)
    const wrapper = mountDialog({ upload })
    await chooseFiles([file('first.png'), file('second.png')])
    PreviewImage.finish('blob:image-1')
    PreviewImage.finish('blob:image-2')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    wrapper.unmount()
    pending.resolve({ src: '/images/first.png' })
    await flushPromises()
    expect(upload).toHaveBeenCalledOnce()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(objectUrls.revoke).toHaveBeenCalledTimes(2)
  })

  it('collects all dropped or pasted image files and ignores text field paste', async () => {
    const wrapper = mountDialog()
    await dropFiles([
      file('drop-a.png'),
      new File(['text'], 'note.txt', { type: 'text/plain' }),
      file('drop-b.png'),
    ])
    expect(PreviewImage.pending.map((image) => image.src)).toEqual(['blob:image-1', 'blob:image-2'])
    const event = await pasteFiles(
      [file('paste-a.png'), file('paste-b.png')],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )
    expect(event.defaultPrevented).toBe(true)
    expect(PreviewImage.pending.map((image) => image.src)).toEqual([
      'blob:image-1',
      'blob:image-2',
      'blob:image-3',
      'blob:image-4',
    ])
    const inputPaste = await pasteFiles(
      [file('ignored.png')],
      wrapper.get('[data-test="rich-text-image-alt"] input').element,
    )
    expect(inputPaste.defaultPrevented).toBe(false)
  })

  it('rejects a non-image paste in the selection area without creating a candidate', async () => {
    const wrapper = mountDialog()
    const event = await pasteFiles(
      [new File(['text'], 'note.txt', { type: 'text/plain' })],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.text()).toContain('请选择图片文件')
    expect(objectUrls.create).not.toHaveBeenCalled()
  })
})

describe('ImageDialog image library', () => {
  it('hides the library without a provider and mixes local and library images without uploading early', async () => {
    const localOnly = mountDialog()
    await localOnly.get('[data-test="rich-text-image-source"]').trigger('click')
    expect(localOnly.findAll('[role="menuitem"]').map((item) => item.text())).toEqual([
      '从本地选择',
    ])
    localOnly.unmount()

    const upload = vi.fn(async () => ({ src: '/images/local.png' }))
    const listLibraryImages = vi.fn(async () =>
      libraryResult([{ src: '/images/shared.png', name: '共享图片.png' }]),
    )
    const wrapper = mountDialog({ upload, listLibraryImages })
    await chooseFiles([file('local.png')])
    PreviewImage.finish('blob:image-1', 600, 300)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('本地说明')
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    await selectSource(wrapper, '从图片库选择')
    await flushPromises()
    expect(listLibraryImages).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(focus.mock.contexts).toContain(
      wrapper.get('[data-test="rich-text-image-library-search"] input').element,
    )
    expect(wrapper.find('[data-test="rich-text-image-alt"]').exists()).toBe(false)
    expect(
      wrapper.get('[data-test="rich-text-image-library-option"]').attributes('aria-selected'),
    ).toBe('false')
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    PreviewImage.finish('/images/shared.png', 400, 200)
    await flushPromises()
    expect(
      wrapper.get('[data-test="rich-text-image-library-option"]').attributes('aria-selected'),
    ).toBe('true')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(2)
    expect(upload).not.toHaveBeenCalled()
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(1)
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    PreviewImage.finish('/images/shared.png', 400, 200)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-library-back"]').trigger('click')
    await wrapper.findAll('[data-test="rich-text-image-candidate"]')[0]!.trigger('click')
    expect(
      (wrapper.get('[data-test="rich-text-image-alt"] input').element as HTMLInputElement).value,
    ).toBe('本地说明')
  })

  it('keeps cross-page selection and ignores an obsolete search response', async () => {
    const first = deferred<ReturnType<typeof libraryResult>>()
    const later = deferred<ReturnType<typeof libraryResult>>()
    const listLibraryImages = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(later.promise)
      .mockResolvedValue(libraryResult([{ src: '/images/page-2.png', name: '第二页.png' }], 2, 21))
    const wrapper = mountDialog({ listLibraryImages })
    await selectSource(wrapper, '从图片库选择')
    const search = wrapper.get('[data-test="rich-text-image-library-search"] input')
    await search.setValue('  FoO  ')
    await search.trigger('compositionstart')
    await wrapper.get('[data-test="rich-text-image-library-submit"]').trigger('click')
    expect(listLibraryImages).toHaveBeenCalledTimes(1)
    const composingEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    Object.defineProperty(composingEnter, 'isComposing', { value: true })
    search.element.dispatchEvent(composingEnter)
    await flushPromises()
    expect(listLibraryImages).toHaveBeenCalledTimes(1)
    await search.trigger('compositionend')
    await wrapper.get('[data-test="rich-text-image-library-submit"]').trigger('click')
    expect(listLibraryImages).toHaveBeenLastCalledWith({ keyword: 'FoO', page: 1, pageSize: 20 })
    later.resolve(libraryResult([{ src: '/images/first.png', name: '搜索结果.png' }], 1, 21))
    await flushPromises()
    first.resolve(libraryResult([{ src: '/images/stale.png', name: '过时结果.png' }]))
    await flushPromises()
    expect(wrapper.text()).toContain('搜索结果.png')
    expect(wrapper.text()).not.toContain('过时结果.png')
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    PreviewImage.finish('/images/first.png')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-library-next"]').trigger('click')
    await flushPromises()
    expect(listLibraryImages).toHaveBeenLastCalledWith({ keyword: 'FoO', page: 2, pageSize: 20 })
    expect(wrapper.text()).toContain('第二页.png')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(1)
    await wrapper.get('[data-test="rich-text-image-library-back"]').trigger('click')
    await selectSource(wrapper, '从图片库选择')
    expect(listLibraryImages).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).toContain('第二页.png')
    expect(
      (
        wrapper.get('[data-test="rich-text-image-library-search"] input')
          .element as HTMLInputElement
      ).value,
    ).toBe('  FoO  ')
    await wrapper
      .get('[data-test="rich-text-image-library-search"] input')
      .trigger('keydown', { key: 'Enter' })
    expect(listLibraryImages).toHaveBeenLastCalledWith({ keyword: 'FoO', page: 1, pageSize: 20 })
  })

  it('allows removing a selected card at the twenty-image limit', async () => {
    const listLibraryImages = vi.fn(async () =>
      libraryResult([{ src: '/images/extra.png', name: '额外.png' }]),
    )
    const wrapper = mountDialog({ listLibraryImages })
    await chooseFiles(Array.from({ length: 20 }, (_, index) => file(`${index}.png`)))
    await selectSource(wrapper, '从图片库选择')
    await flushPromises()
    expect(
      wrapper.get('[data-test="rich-text-image-library-option"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).toContain('已选择 20 张图片，请先移除再添加')
    await wrapper.get('[data-test="rich-text-image-library-back"]').trigger('click')
    await wrapper.get('[data-test="rich-text-image-remove"]').trigger('click')
    await selectSource(wrapper, '从图片库选择')
    expect(
      wrapper.get('[data-test="rich-text-image-library-option"]').attributes('disabled'),
    ).toBeUndefined()
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(20)
    expect(
      wrapper.get('[data-test="rich-text-image-library-option"]').attributes('aria-selected'),
    ).toBe('true')
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(19)
  })

  it('retries reading a selected library image without uploading', async () => {
    const upload = vi.fn()
    const listLibraryImages = vi.fn(async () =>
      libraryResult([{ src: '/images/broken.png', name: '图片.png' }]),
    )
    const wrapper = mountDialog({ upload, listLibraryImages })
    await selectSource(wrapper, '从图片库选择')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    PreviewImage.fail('/images/broken.png')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-library-back"]').trigger('click')
    expect(wrapper.text()).toContain('图片读取失败')
    await wrapper.get('[data-test="rich-text-image-retry"]').trigger('click')
    PreviewImage.finish('/images/broken.png', 300, 150)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    expect(upload).not.toHaveBeenCalled()
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject([
      { src: '/images/broken.png', alt: '图片.png', width: 300, height: 150 },
    ])
  })

  it('treats a successful local upload with the same URL as a selected library card', async () => {
    const upload = vi.fn(async (selected: File) => {
      if (selected.name === 'other.png') throw new Error('offline')
      return { src: '/images/shared.png' }
    })
    const listLibraryImages = vi.fn(async () =>
      libraryResult([{ src: '/images/shared.png', name: '已上传.png' }]),
    )
    const wrapper = mountDialog({ upload, listLibraryImages })
    await chooseFiles([file('shared.png'), file('other.png')])
    PreviewImage.finish('blob:image-1')
    PreviewImage.finish('blob:image-2')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    PreviewImage.finish('/images/shared.png')
    await flushPromises()
    expect(wrapper.emitted('confirm')).toBeUndefined()

    await selectSource(wrapper, '从图片库选择')
    await flushPromises()
    expect(
      wrapper.get('[data-test="rich-text-image-library-option"]').attributes('aria-selected'),
    ).toBe('true')
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    expect(wrapper.findAll('[data-test="rich-text-image-candidate"]')).toHaveLength(1)
    expect(
      wrapper.get('[data-test="rich-text-image-library-option"]').attributes('aria-selected'),
    ).toBe('false')
  })

  it('shows failure, retries, and distinguishes an empty library from no search results', async () => {
    const listLibraryImages = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(libraryResult([]))
      .mockResolvedValueOnce(libraryResult([]))
    const wrapper = mountDialog({ listLibraryImages })
    await selectSource(wrapper, '从图片库选择')
    await flushPromises()
    expect(wrapper.text()).toContain('图片库加载失败')
    await wrapper.get('[data-test="rich-text-image-library-back"]').trigger('click')
    expect(wrapper.find('[aria-label="点击选择或拖入图片"]').exists()).toBe(true)
    await selectSource(wrapper, '从图片库选择')
    expect(listLibraryImages).toHaveBeenCalledTimes(1)
    await wrapper.get('[data-test="rich-text-image-library-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('暂无可用图片')
    await wrapper.get('[data-test="rich-text-image-library-search"] input').setValue('不存在')
    await wrapper.get('[data-test="rich-text-image-library-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('未找到匹配的图片')
    await wrapper.get('[data-test="rich-text-image-library-back"]').trigger('click')
    expect(wrapper.find('[aria-label="点击选择或拖入图片"]').exists()).toBe(true)
    await selectSource(wrapper, '从图片库选择')
    expect(
      wrapper.get('[data-test="rich-text-image-library-search"] input').element,
    ).toHaveProperty('value', '不存在')
    expect(listLibraryImages).toHaveBeenCalledTimes(3)
  })

  it('locks library navigation and retry while a local image is uploading', async () => {
    const pendingUpload = deferred<{ src: string }>()
    const upload = vi.fn(() => pendingUpload.promise)
    const listLibraryImages = vi.fn(async () => {
      throw new Error('offline')
    })
    const wrapper = mountDialog({ upload, listLibraryImages })
    await chooseFiles([file('local.png')])
    PreviewImage.finish('blob:image-1')
    await flushPromises()
    await selectSource(wrapper, '从图片库选择')
    await flushPromises()
    expect(wrapper.text()).toContain('图片库加载失败')

    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    expect(upload).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-test="rich-text-image-source"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-library-back"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.get('[data-test="rich-text-image-library-retry"]').attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('[data-test="rich-text-image-library-back"]').trigger('click')
    await wrapper.get('[data-test="rich-text-image-library-retry"]').trigger('click')
    expect(wrapper.find('[data-test="rich-text-image-library-search"]').exists()).toBe(true)
    expect(listLibraryImages).toHaveBeenCalledOnce()

    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    pendingUpload.resolve({ src: '/images/local.png' })
    await flushPromises()
  })

  it('applies an editing replacement only on confirmation and ignores a late query after closing', async () => {
    const pending = deferred<ReturnType<typeof libraryResult>>()
    const listLibraryImages = vi
      .fn()
      .mockResolvedValueOnce(libraryResult([{ src: '/images/replacement.png', name: '替换.png' }]))
      .mockReturnValueOnce(pending.promise)
    const wrapper = mountDialog({
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
      listLibraryImages,
    })
    PreviewImage.finish('/images/original.png', 1000, 500)
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-image-source"]').text()).toBe('替换图片')
    await selectSource(wrapper, '从图片库选择')
    await flushPromises()
    expect(
      wrapper
        .get('[data-test="rich-text-image-library-options"]')
        .attributes('aria-multiselectable'),
    ).toBe('false')
    await wrapper.get('[data-test="rich-text-image-library-option"]').trigger('click')
    expect(wrapper.find('[data-test="rich-text-image-library-search"]').exists()).toBe(false)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    PreviewImage.finish('/images/replacement.png', 800, 800)
    await flushPromises()
    expect(
      (wrapper.get('[data-test="rich-text-image-alt"] input').element as HTMLInputElement).value,
    ).toBe('原说明')
    expect(
      (wrapper.get('[data-test="rich-text-image-width"] input').element as HTMLInputElement).value,
    ).toBe('500')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/images/replacement.png',
      alt: '原说明',
      width: 500,
      height: 500,
    })

    const another = mountDialog({ listLibraryImages })
    await selectSource(another, '从图片库选择')
    await another.get('[data-test="rich-text-image-cancel"]').trigger('click')
    pending.resolve(libraryResult([{ src: '/images/late.png', name: '迟到.png' }]))
    await flushPromises()
    expect(another.text()).not.toContain('迟到.png')
  })
})

describe('ImageDialog editing', () => {
  it('preserves both existing display dimensions when they differ from the natural ratio', async () => {
    const wrapper = mountDialog({
      existingImage: { src: '/images/original.png', alt: '裁切展示', width: 600, height: 100 },
    })
    PreviewImage.finish('/images/original.png', 1000, 500)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/images/original.png',
      alt: '裁切展示',
      width: 600,
      height: 100,
    })
  })

  it('keeps an empty description when editing an image without alt text', async () => {
    const wrapper = mountDialog({
      existingImage: { src: '/images/original.png', alt: null, width: 500, height: 250 },
    })
    PreviewImage.finish('/images/original.png', 1000, 500)
    await flushPromises()
    expect(
      (wrapper.get('[data-test="rich-text-image-alt"] input').element as HTMLInputElement).value,
    ).toBe('')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({ alt: '' })
  })

  it('preserves the current alt and display width until a local replacement is applied', async () => {
    const upload = vi.fn(async () => ({ src: '/images/replacement.png' }))
    const wrapper = mountDialog({
      upload,
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
    })
    PreviewImage.finish('/images/original.png', 1000, 500)
    await flushPromises()
    await chooseFiles([file('replacement.png')])
    expect(upload).not.toHaveBeenCalled()
    PreviewImage.finish('blob:image-1', 800, 800)
    await flushPromises()
    expect(
      (wrapper.get('[data-test="rich-text-image-alt"] input').element as HTMLInputElement).value,
    ).toBe('原说明')
    expect(
      (wrapper.get('[data-test="rich-text-image-width"] input').element as HTMLInputElement).value,
    ).toBe('500')
    expect(wrapper.get('[data-test="rich-text-image-confirm"]').text()).toContain('上传并应用')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    PreviewImage.finish('/images/replacement.png', 800, 800)
    await flushPromises()
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/images/replacement.png',
      alt: '原说明',
      width: 500,
      height: 500,
    })
  })

  it('rejects multiple pasted replacement images and leaves the current candidate intact', async () => {
    const wrapper = mountDialog({
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
    })
    await dropFiles([file('one.png'), file('two.png')])
    expect(wrapper.text()).toContain('请选择一张图片')
    expect(objectUrls.create).not.toHaveBeenCalled()
    const event = await pasteFiles(
      [file('one.png'), file('two.png')],
      wrapper.get('[data-test="rich-text-image-drop-zone"]').element,
    )
    expect(event.defaultPrevented).toBe(true)
    expect(objectUrls.create).not.toHaveBeenCalled()
    await chooseFiles([file('one.png'), file('two.png')])
    expect(wrapper.text()).toContain('请选择一张图片')
    expect(objectUrls.create).not.toHaveBeenCalled()
  })

  it('uses the replacement natural size when the original image has no display width', async () => {
    const upload = vi.fn(async () => ({ src: '/images/replacement.png' }))
    const wrapper = mountDialog({
      upload,
      existingImage: { src: '/images/original.png', alt: '原说明', width: null, height: 250 },
    })
    PreviewImage.finish('/images/original.png', 1000, 500)
    await flushPromises()
    await chooseFiles([file('replacement.png')])
    PreviewImage.finish('blob:image-1', 800, 400)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    PreviewImage.finish('/images/replacement.png', 800, 400)
    await flushPromises()

    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({
      src: '/images/replacement.png',
      alt: '原说明',
      width: 800,
      height: 400,
    })
  })
})
