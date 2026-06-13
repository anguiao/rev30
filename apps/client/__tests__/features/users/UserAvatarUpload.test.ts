import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserAvatarUpload from '../../../src/features/users/UserAvatarUpload.vue'
import { compressImageFile, uploadAttachment } from '../../../src/features/attachments'

vi.mock('../../../src/features/attachments/imageCompression', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/attachments/imageCompression')>()),
  compressImageFile: vi.fn((file: File) => file),
}))

vi.mock('../../../src/features/attachments/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/attachments/requests')>()),
  uploadAttachment: vi.fn(),
}))

const compressImageFileMock = vi.mocked(compressImageFile)
const uploadAttachmentMock = vi.mocked(uploadAttachment)

function mountUpload(props = { avatarId: null as string | null }) {
  return mount(UserAvatarUpload, {
    props: {
      nickname: 'Ada Lovelace',
      username: 'ada',
      ...props,
    },
  })
}

describe('UserAvatarUpload', () => {
  beforeEach(() => {
    compressImageFileMock.mockReset()
    compressImageFileMock.mockImplementation(async (file) => file)
    uploadAttachmentMock.mockReset()
    uploadAttachmentMock.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
    })
  })

  it('shows a plus icon for empty or failed avatar states', async () => {
    const emptyWrapper = mountUpload({ avatarId: null })
    expect(emptyWrapper.find('.i-\\[lucide--plus\\]').exists()).toBe(true)
    expect(emptyWrapper.text()).not.toContain('A')

    const failedWrapper = mountUpload({ avatarId: '11111111-1111-4111-8111-111111111111' })
    expect(failedWrapper.get('img').attributes('src')).toBe(
      '/api/attachments/11111111-1111-4111-8111-111111111111/content',
    )
    await failedWrapper.get('img').trigger('error')

    expect(failedWrapper.find('.i-\\[lucide--plus\\]').exists()).toBe(true)
    expect(failedWrapper.text()).not.toContain('A')
  })

  it('emits uploaded avatar ids and upload errors', async () => {
    const wrapper = mountUpload({ avatarId: null })
    const file = new File(['png'], 'avatar.png', { type: 'image/png' })
    const compressedFile = new File(['webp'], 'avatar.webp', { type: 'image/webp' })
    const exposed = wrapper.vm as unknown as { uploadFile: (file: File) => Promise<void> }
    compressImageFileMock.mockResolvedValueOnce(compressedFile)

    await exposed.uploadFile(file)
    await flushPromises()

    expect(compressImageFileMock).toHaveBeenCalledWith(file, {
      maxDimension: 512,
      quality: 0.82,
    })
    expect(uploadAttachmentMock).toHaveBeenCalledWith(compressedFile, {
      usage: 'avatar',
      readPolicy: 'authenticated',
    })
    expect(wrapper.emitted('uploaded')).toEqual([['33333333-3333-4333-8333-333333333333']])

    uploadAttachmentMock.mockRejectedValueOnce(new Error('upload failed'))
    await expect(exposed.uploadFile(file)).rejects.toThrow('upload failed')
    await flushPromises()

    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(Error)
  })

  it('supports repeated uploads through real customRequest flow', async () => {
    const wrapper = mountUpload({ avatarId: null })
    const input = wrapper.get('input[type="file"]')
    const button = wrapper.get('button')

    const fileOne = new File(['png1'], 'avatar1.png', { type: 'image/png' })
    const fileTwo = new File(['png2'], 'avatar2.png', { type: 'image/png' })
    let pendingResolve: () => void = () => {}
    uploadAttachmentMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          pendingResolve = () =>
            resolve({
              id: '33333333-3333-4333-8333-333333333333',
            })
        }),
    )

    const triggerUpload = (file: File) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      Object.defineProperty(input.element, 'files', {
        configurable: true,
        value: dataTransfer.files,
      })
      return input.trigger('change')
    }

    const firstSubmit = triggerUpload(fileOne)
    await flushPromises()
    expect(button.attributes('disabled')).toBe('')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(uploadAttachmentMock).toHaveBeenCalledTimes(1)

    pendingResolve()
    await firstSubmit
    await flushPromises()

    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-busy')).toBe('false')

    expect(wrapper.emitted('uploaded')?.[0]?.[0]).toBe('33333333-3333-4333-8333-333333333333')

    await triggerUpload(fileTwo)
    await flushPromises()

    expect(uploadAttachmentMock).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('uploaded')?.[1]?.[0]).toBe('33333333-3333-4333-8333-333333333333')

    uploadAttachmentMock.mockRejectedValueOnce(new Error('upload failed'))
    await triggerUpload(fileTwo)
    await flushPromises()

    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(Error)
    const uploadedBeforeRecovery = wrapper.emitted('uploaded')?.length ?? 0

    await triggerUpload(fileTwo)
    await flushPromises()
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-busy')).toBe('false')

    expect(wrapper.emitted('uploaded')?.length).toBeGreaterThan(uploadedBeforeRecovery)
    expect(wrapper.emitted('error')).toHaveLength(1)
  })
})
