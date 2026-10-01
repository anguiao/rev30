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
import ImageEditDialog from '../../../../../../src/features/image/client/vue/edit/ImageEditDialog.vue'
import type { ImageUpload } from '../../../../../../src/features/image/client/vue/shared/draft'
import type { RichTextImageLibraryResult } from '../../../../../../src/features/image/client/vue'

type DialogProps = InstanceType<typeof ImageEditDialog>['$props']
function mountDialog(options: Omit<DialogProps, 'upload'> & { upload?: ImageUpload }) {
  return mount(ImageEditDialog, {
    attachTo: appendTestElement('div'),
    global: { stubs: { teleport: true } },
    props: { upload: vi.fn(), ...options },
  })
}

describe('ImageEditDialog', () => {
  it('applies an editing replacement only on confirmation and ignores a late query after closing', async () => {
    const pending = deferred<RichTextImageLibraryResult>()
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
    expect(picker.fileOptions.at(-1)).toMatchObject({ multiple: false })
    expect(wrapper.find('[data-test="rich-text-image-candidate-list"]').exists()).toBe(false)
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

    const another = mountDialog({
      listLibraryImages,
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
    })
    await selectSource(another, '从图片库选择')
    await another.get('[data-test="rich-text-image-cancel"]').trigger('click')
    expect(another.emitted('cancel')).toEqual([[]])
    another.unmount()
    pending.resolve(libraryResult([{ src: '/images/late.png', name: '迟到.png' }]))
    await flushPromises()
    expect(another.text()).not.toContain('迟到.png')
  })

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

  it('explains an invalid size and enables applying after restoring the original size', async () => {
    const wrapper = mountDialog({
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
    })
    PreviewImage.finish('/images/original.png', 1000, 500)
    await flushPromises()
    const input = wrapper.get('[data-test="rich-text-image-height"] input')
    await input.setValue('')
    await input.trigger('blur')
    expect(wrapper.text()).toContain('请输入大于 0 的整数')
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeDefined()

    await wrapper
      .findAll('button')
      .find((button) => button.text() === '恢复原尺寸')!
      .trigger('click')
    expect(wrapper.text()).not.toContain('请输入大于 0 的整数')
    expect(
      wrapper.get('[data-test="rich-text-image-confirm"]').attributes('disabled'),
    ).toBeUndefined()
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

  it('preserves edited properties across replacements and releases obsolete previews', async () => {
    const wrapper = mountDialog({
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
    })
    PreviewImage.finish('/images/original.png', 1000, 500)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('新说明')
    await wrapper.get('[data-test="rich-text-image-height"] input').setValue('150')
    await wrapper.get('[data-test="rich-text-image-height"] input').trigger('blur')
    await chooseFiles([file('discarded.png')])
    const stalePreview = PreviewImage.pending.find((image) => image.src === 'blob:image-1')!
    const lateError = stalePreview.onerror!
    await chooseFiles([file('replacement.png')])
    lateError()
    PreviewImage.finish('blob:image-2', 800, 800)
    await flushPromises()

    expect(stalePreview.src).toBe('')
    expect(objectUrls.revoke).toHaveBeenCalledWith('blob:image-1')
    expect(wrapper.emitted('error')).toBeUndefined()
    expect(wrapper.get('[data-test="rich-text-image-alt"] input').element).toHaveProperty(
      'value',
      '新说明',
    )
    expect(wrapper.get('[data-test="rich-text-image-width"] input').element).toHaveProperty(
      'value',
      '300',
    )
    expect(wrapper.get('[data-test="rich-text-image-height"] input').element).toHaveProperty(
      'value',
      '300',
    )
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    expect(objectUrls.revoke).toHaveBeenCalledWith('blob:image-2')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('retries reading an uploaded replacement without uploading again', async () => {
    const upload = vi.fn(async () => ({ src: '/images/replacement.png' }))
    const wrapper = mountDialog({
      upload,
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
      pastedFiles: [file('replacement.png')],
    })
    PreviewImage.finish('blob:image-1', 800, 800)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    PreviewImage.fail('/images/replacement.png')
    await flushPromises()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    await wrapper.get('[data-test="rich-text-image-retry"]').trigger('click')
    PreviewImage.finish('/images/replacement.png', 400, 400)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()
    expect(upload).toHaveBeenCalledOnce()
    expect(wrapper.emitted('confirm')).toEqual([
      [{ src: '/images/replacement.png', alt: '原说明', width: 500, height: 500 }],
    ])
  })

  it('ignores an upload that finishes after the editing dialog is canceled', async () => {
    const pending = deferred<{ src: string }>()
    const wrapper = mountDialog({
      upload: () => pending.promise,
      existingImage: { src: '/images/original.png', alt: '原说明', width: 500, height: 250 },
      pastedFiles: [file('replacement.png')],
    })
    PreviewImage.finish('blob:image-1', 800, 800)
    await flushPromises()
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    pending.resolve({ src: '/images/late.png' })
    await flushPromises()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('error')).toBeUndefined()
    expect(PreviewImage.pending.some((image) => image.src === '/images/late.png')).toBe(false)
    expect(objectUrls.revoke).toHaveBeenCalledWith('blob:image-1')
  })
})
