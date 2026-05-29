import { mount } from '@vue/test-utils'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { createAttachmentSignedUrl, useAttachmentUrl } from '../../../src/features/attachments'

vi.mock('../../../src/features/attachments/requests', () => ({
  createAttachmentSignedUrl: vi.fn(),
}))

const createAttachmentSignedUrlMock = vi.mocked(createAttachmentSignedUrl)

beforeEach(() => {
  createAttachmentSignedUrlMock.mockReset()
  createAttachmentSignedUrlMock.mockResolvedValue({
    url: '/api/attachments/1/content?token=token',
    expiresAt: '2026-05-29T00:05:00.000Z',
  })
})

describe('useAttachmentUrl', () => {
  it('fetches signed URLs when enabled and id is present', async () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          return useAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
            disposition: ATTACHMENT_DISPOSITION_INLINE,
          })
        },
        template: '<span>{{ url }}</span>',
      }),
    )

    await nextTick()
    await nextTick()

    expect(createAttachmentSignedUrlMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      { disposition: ATTACHMENT_DISPOSITION_INLINE },
    )
    expect(wrapper.text()).toBe('/api/attachments/1/content?token=token')
  })

  it('does not fetch while disabled and clears existing URL', async () => {
    const enabled = ref(false)
    const wrapper = mount(
      defineComponent({
        setup() {
          return useAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
            disposition: ATTACHMENT_DISPOSITION_INLINE,
            enabled,
          })
        },
        template: '<span>{{ url }}</span>',
      }),
    )

    await nextTick()
    expect(createAttachmentSignedUrlMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toBe('')

    enabled.value = true
    await nextTick()
    await nextTick()

    expect(createAttachmentSignedUrlMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toBe('/api/attachments/1/content?token=token')

    enabled.value = false
    await nextTick()

    expect(wrapper.text()).toBe('')
  })
})
