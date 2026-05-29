import { mount } from '@vue/test-utils'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { createAttachmentSignedUrl, useAttachmentUrl } from '../../../src/features/attachments'

vi.mock('../../../src/features/attachments/requests', () => ({
  createAttachmentSignedUrl: vi.fn(),
}))

const createAttachmentSignedUrlMock = vi.mocked(createAttachmentSignedUrl)
type SignedUrlResult = { url: string; expiresAt: string }

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

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

  it('ignores stale signed-url result after becoming disabled', async () => {
    const enabled = ref(true)
    const pending = createDeferred<SignedUrlResult>()
    createAttachmentSignedUrlMock.mockImplementationOnce(() => pending.promise)

    const wrapper = mount(
      defineComponent({
        setup() {
          return useAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
            enabled,
          })
        },
        template: '<span>{{ url }}|{{ expiresAt }}|{{ isLoading }}</span>',
      }),
    )

    await nextTick()
    expect(createAttachmentSignedUrlMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('true')

    enabled.value = false
    await nextTick()

    expect(wrapper.text()).toBe('||false')

    pending.resolve({
      url: '/api/attachments/stale/content?token=stale',
      expiresAt: '2026-05-29T01:00:00.000Z',
    })
    await Promise.resolve()
    await nextTick()

    expect(wrapper.text()).toBe('||false')
  })

  it('ignores stale result when id changes during pending request', async () => {
    const id = ref('11111111-1111-4111-8111-111111111111')
    const oldRequest = createDeferred<SignedUrlResult>()
    createAttachmentSignedUrlMock.mockImplementationOnce(() => oldRequest.promise)
    createAttachmentSignedUrlMock.mockResolvedValueOnce({
      url: '/api/attachments/new/content?token=new',
      expiresAt: '2026-05-29T02:00:00.000Z',
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          return useAttachmentUrl(id)
        },
        template: '<span>{{ url }}</span>',
      }),
    )

    await nextTick()
    expect(createAttachmentSignedUrlMock).toHaveBeenCalledTimes(1)

    id.value = '22222222-2222-4222-8222-222222222222'
    await nextTick()
    await nextTick()

    expect(createAttachmentSignedUrlMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toBe('/api/attachments/new/content?token=new')

    oldRequest.resolve({
      url: '/api/attachments/old/content?token=old',
      expiresAt: '2026-05-29T03:00:00.000Z',
    })
    await Promise.resolve()
    await nextTick()

    expect(wrapper.text()).toBe('/api/attachments/new/content?token=new')
  })
})
