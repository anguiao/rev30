import { flushPromises, mount } from '@vue/test-utils'
import { PiniaColada } from '@pinia/colada'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UserAvatar from '../../../src/features/users/UserAvatar.vue'
import { createAttachmentSignedUrl } from '../../../src/features/attachments'
import { createTestPinia, disposeActiveTestPinia } from '../../helpers/pinia'

vi.mock('../../../src/features/attachments/requests', () => ({
  createAttachmentSignedUrl: vi.fn(),
}))

const createAttachmentSignedUrlMock = vi.mocked(createAttachmentSignedUrl)

function mountAvatar(props: InstanceType<typeof UserAvatar>['$props']) {
  return mount(UserAvatar, {
    props,
    global: {
      plugins: [createTestPinia(), PiniaColada],
    },
  })
}

describe('UserAvatar', () => {
  beforeEach(() => {
    createAttachmentSignedUrlMock.mockReset()
    createAttachmentSignedUrlMock.mockResolvedValue({
      url: '/api/attachments/avatar/content?token=token',
      expiresAt: '2026-05-30T00:05:00.000Z',
    })
  })

  afterEach(() => {
    disposeActiveTestPinia()
  })

  it('renders a default initial when avatar id is missing', () => {
    const wrapper = mountAvatar({
      avatarId: null,
      nickname: 'Ada Lovelace',
      username: 'ada',
    })

    expect(wrapper.text()).toContain('A')
    expect(createAttachmentSignedUrlMock).not.toHaveBeenCalled()
  })

  it('falls back to username when nickname is blank', () => {
    const wrapper = mountAvatar({
      avatarId: null,
      nickname: '   ',
      username: 'grace',
    })

    expect(wrapper.text()).toContain('G')
    expect(createAttachmentSignedUrlMock).not.toHaveBeenCalled()
  })

  it('renders signed avatar images when available', async () => {
    const wrapper = mountAvatar({
      avatarId: '11111111-1111-4111-8111-111111111111',
      nickname: 'Ada Lovelace',
      username: 'ada',
    })

    await flushPromises()

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe('/api/attachments/avatar/content?token=token')
  })

  it('falls back to initials when signing or image loading fails', async () => {
    createAttachmentSignedUrlMock.mockRejectedValueOnce(new Error('gone'))
    const wrapper = mountAvatar({
      avatarId: '11111111-1111-4111-8111-111111111111',
      nickname: 'Grace Hopper',
      username: 'grace',
    })

    await flushPromises()

    expect(wrapper.text()).toContain('G')

    createAttachmentSignedUrlMock.mockResolvedValueOnce({
      url: '/api/attachments/avatar/content?token=token',
      expiresAt: '2026-05-30T00:05:00.000Z',
    })
    const imageWrapper = mountAvatar({
      avatarId: '22222222-2222-4222-8222-222222222222',
      nickname: 'Alan Turing',
      username: 'alan',
    })
    await flushPromises()

    await imageWrapper.get('img').trigger('error')
    expect(imageWrapper.text()).toContain('A')
  })
})
