import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { appendTestElement } from '../../../../../helpers/editor'
import {
  PreviewImage,
  objectUrls,
  picker,
  deferred,
  file,
  libraryResult,
  selectSource,
  chooseFiles,
  dropFiles,
  pasteFiles,
} from '../../../../../helpers/image-dialog'
import ImageBatchInsertDialog from '../../../../../../src/features/image/client/vue/insert/ImageBatchInsertDialog.vue'
import type { ImageUpload } from '../../../../../../src/features/image/client/vue/shared/draft'
import type { RichTextImageLibraryResult } from '../../../../../../src/features/image/client/vue'

type DialogProps = InstanceType<typeof ImageBatchInsertDialog>['$props']
function mountDialog(options: Omit<DialogProps, 'upload'> & { upload?: ImageUpload } = {}) {
  return mount(ImageBatchInsertDialog, {
    attachTo: appendTestElement('div'),
    global: { stubs: { teleport: true } },
    props: { upload: vi.fn(), ...options },
  })
}

describe('ImageBatchInsertDialog', () => {
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

  it.each(['width', 'height'] as const)(
    'identifies an invalid %s after switching images and clears the error when corrected',
    async (dimension) => {
      const wrapper = mountDialog()
      await chooseFiles([file('first.png'), file('second.png')])
      expect(wrapper.text()).not.toContain('尺寸无效')
      expect(wrapper.text()).not.toContain('请输入大于 0 的整数')
      PreviewImage.finish('blob:image-1', 800, 400)
      PreviewImage.finish('blob:image-2', 400, 400)
      await flushPromises()

      const candidates = wrapper.findAll('[role="option"]')
      const confirm = wrapper.get('[data-test="rich-text-image-confirm"]')
      await candidates[1]!.trigger('click')
      const input = wrapper.get(`[data-test="rich-text-image-${dimension}"] input`)
      await input.setValue('')
      await input.trigger('blur')
      expect(candidates[1]!.text()).toContain('尺寸无效')
      expect(candidates[0]!.text()).not.toContain('尺寸无效')
      expect(wrapper.text()).toContain('请输入大于 0 的整数')
      expect(confirm.attributes('disabled')).toBeDefined()

      await candidates[0]!.trigger('click')
      expect(candidates[1]!.text()).toContain('尺寸无效')
      expect(wrapper.text()).not.toContain('请输入大于 0 的整数')
      expect(confirm.attributes('disabled')).toBeDefined()

      await candidates[1]!.trigger('click')
      await input.setValue('200')
      await input.trigger('blur')
      expect(wrapper.text()).not.toContain('尺寸无效')
      expect(wrapper.text()).not.toContain('请输入大于 0 的整数')
      expect(confirm.attributes('disabled')).toBeUndefined()
    },
  )

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
    expect(listLibraryImages).not.toHaveBeenCalled()
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
    const first = deferred<RichTextImageLibraryResult>()
    const later = deferred<RichTextImageLibraryResult>()
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
    expect(wrapper.find('[data-test="rich-text-image-library-search"]').exists()).toBe(false)
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
    expect(wrapper.get('[data-test="rich-text-image-library-search"]').isVisible()).toBe(true)
    expect(listLibraryImages).toHaveBeenCalledOnce()

    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    pendingUpload.resolve({ src: '/images/local.png' })
    await flushPromises()
  })
})
