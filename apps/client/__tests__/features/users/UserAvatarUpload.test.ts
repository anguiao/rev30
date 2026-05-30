import { flushPromises, mount } from '@vue/test-utils'
import { PiniaColada } from '@pinia/colada'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTACHMENT_USAGE_AVATAR } from '@rev30/contracts'
import UserAvatarUpload from '../../../src/features/users/UserAvatarUpload.vue'
import { createAttachmentSignedUrl, uploadAttachment } from '../../../src/features/attachments'
import { createTestPinia, disposeActiveTestPinia } from '../../helpers/pinia'

vi.mock('../../../src/features/attachments/requests', () => ({
  createAttachmentSignedUrl: vi.fn(),
  uploadAttachment: vi.fn(),
}))

const createAttachmentSignedUrlMock = vi.mocked(createAttachmentSignedUrl)
const uploadAttachmentMock = vi.mocked(uploadAttachment)

function mountUpload(props = { avatarId: null as string | null }) {
  return mount(UserAvatarUpload, {
    props: {
      nickname: 'Ada Lovelace',
      username: 'ada',
      ...props,
    },
    global: {
      plugins: [createTestPinia(), PiniaColada],
    },
  })
}

describe('UserAvatarUpload', () => {
  beforeEach(() => {
    createAttachmentSignedUrlMock.mockReset()
    uploadAttachmentMock.mockReset()
    createAttachmentSignedUrlMock.mockResolvedValue({
      url: '/api/attachments/avatar/content?token=token',
      expiresAt: '2026-05-30T00:05:00.000Z',
    })
    uploadAttachmentMock.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      originalName: 'avatar.png',
      mimeType: 'image/png',
      extension: 'png',
      size: 128,
      usage: ATTACHMENT_USAGE_AVATAR,
      createdAt: '2026-05-30T00:00:00.000Z',
    })
  })

  afterEach(() => {
    disposeActiveTestPinia()
  })

  it('shows a plus icon for empty or failed avatar states', async () => {
    const emptyWrapper = mountUpload({ avatarId: null })
    expect(emptyWrapper.find('.i-\\[lucide--plus\\]').exists()).toBe(true)
    expect(emptyWrapper.text()).not.toContain('A')

    createAttachmentSignedUrlMock.mockRejectedValueOnce(new Error('gone'))
    const failedWrapper = mountUpload({ avatarId: '11111111-1111-4111-8111-111111111111' })
    await flushPromises()

    expect(failedWrapper.find('.i-\\[lucide--plus\\]').exists()).toBe(true)
    expect(failedWrapper.text()).not.toContain('A')
  })

  it('emits uploaded avatar ids and upload errors', async () => {
    const wrapper = mountUpload({ avatarId: null })
    const file = new File(['png'], 'avatar.png', { type: 'image/png' })
    const exposed = wrapper.vm as unknown as { uploadFile: (file: File) => Promise<void> }

    await exposed.uploadFile(file)
    await flushPromises()

    expect(uploadAttachmentMock).toHaveBeenCalledWith(file, { usage: ATTACHMENT_USAGE_AVATAR })
    expect(wrapper.emitted('uploaded')).toEqual([
      ['33333333-3333-4333-8333-333333333333'],
    ])

    uploadAttachmentMock.mockRejectedValueOnce(new Error('upload failed'))
    await expect(exposed.uploadFile(file)).rejects.toThrow('upload failed')
    await flushPromises()

    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(Error)
  })
})
