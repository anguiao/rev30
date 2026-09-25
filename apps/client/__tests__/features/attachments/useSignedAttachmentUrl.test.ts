import { flushPromises, mount } from '@vue/test-utils'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import {
  resolveSignedAttachmentUrl,
  useSignedAttachmentUrl,
} from '../../../src/features/attachments'
import { createTestQueryHarness } from '../../helpers/colada'
import { createDeferred } from '../../helpers/promise'
import { ApiRequestError } from '../../../src/utils/request'

vi.mock('../../../src/features/attachments/requests', () => ({
  resolveSignedAttachmentUrl: vi.fn(),
}))

const resolveSignedAttachmentUrlMock = vi.mocked(resolveSignedAttachmentUrl)
type ResolvedUrlResult = Awaited<ReturnType<typeof resolveSignedAttachmentUrl>>

function resolveUrl(url: string, expiresAt: string): ResolvedUrlResult {
  return {
    expiresAt,
    url,
  }
}

function mountUseSignedAttachmentUrl(
  setup: () => ReturnType<typeof useSignedAttachmentUrl>,
  template: string,
) {
  const { plugins } = createTestQueryHarness()

  return mount(defineComponent({ setup, template }), {
    global: {
      plugins,
    },
  })
}

async function flushAttachmentUrl() {
  await nextTick()
  await flushPromises()
  await nextTick()
}

beforeEach(() => {
  resolveSignedAttachmentUrlMock.mockReset()
  resolveSignedAttachmentUrlMock.mockResolvedValue(
    resolveUrl('/api/attachments/1/content?token=token', '2026-05-29T00:05:00.000Z'),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSignedAttachmentUrl', () => {
  it('fetches content URLs when enabled and id is present', async () => {
    const wrapper = mountUseSignedAttachmentUrl(
      () =>
        useSignedAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
          disposition: ATTACHMENT_DISPOSITION_INLINE,
        }),
      '<span>{{ url }}</span>',
    )

    await flushAttachmentUrl()

    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      {
        disposition: ATTACHMENT_DISPOSITION_INLINE,
      },
    )
    expect(wrapper.text()).toBe('/api/attachments/1/content?token=token')
  })

  it('refreshes content URLs before expiration', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T00:00:00.000Z'))
    resolveSignedAttachmentUrlMock
      .mockResolvedValueOnce(
        resolveUrl('/api/attachments/1/content?token=first', '2026-05-29T00:05:00.000Z'),
      )
      .mockResolvedValueOnce(
        resolveUrl('/api/attachments/1/content?token=second', '2026-05-29T00:10:00.000Z'),
      )

    const wrapper = mountUseSignedAttachmentUrl(
      () => useSignedAttachmentUrl(ref('11111111-1111-4111-8111-111111111111')),
      '<span>{{ url }}</span>',
    )

    await flushAttachmentUrl()

    expect(wrapper.text()).toBe('/api/attachments/1/content?token=first')
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(269_999)
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await flushAttachmentUrl()

    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toBe('/api/attachments/1/content?token=second')
  })

  it.each([
    ['network failure', new Error('Temporary network failure')],
    ['server error', new ApiRequestError(503, 'Service unavailable')],
  ])('recovers an automatic URL refresh after a %s', async (_, error) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T00:00:00.000Z'))
    resolveSignedAttachmentUrlMock
      .mockResolvedValueOnce(resolveUrl('/first.png', '2026-05-29T00:05:00.000Z'))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(resolveUrl('/recovered.png', '2026-05-29T00:10:00.000Z'))
    const wrapper = mountUseSignedAttachmentUrl(
      () => useSignedAttachmentUrl(ref('11111111-1111-4111-8111-111111111111')),
      '<span>{{ url }}</span>',
    )
    await flushAttachmentUrl()
    await vi.advanceTimersByTimeAsync(270_000)
    await flushAttachmentUrl()
    expect(wrapper.text()).toBe('')
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(5_000)
    await flushAttachmentUrl()
    expect(wrapper.text()).toBe('/recovered.png')
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it.each([403, 404])(
    'stops retries when disabled and does not repeatedly retry HTTP %i',
    async (status) => {
      vi.useFakeTimers()
      const enabled = ref(true)
      resolveSignedAttachmentUrlMock.mockRejectedValueOnce(new Error('Temporary network failure'))
      const wrapper = mountUseSignedAttachmentUrl(
        () => useSignedAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), { enabled }),
        '<span>{{ url }}</span>',
      )
      await flushAttachmentUrl()
      enabled.value = false
      await flushAttachmentUrl()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(1)

      resolveSignedAttachmentUrlMock.mockRejectedValue(new ApiRequestError(status, 'Unavailable'))
      enabled.value = true
      await flushAttachmentUrl()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    },
  )

  it('recovers an initial request failure on reconnect and stops pending retries on unmount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T00:00:00.000Z'))
    resolveSignedAttachmentUrlMock
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(resolveUrl('/reconnected.png', '2026-05-29T00:05:00.000Z'))
      .mockRejectedValue(new Error('Offline again'))
    const wrapper = mountUseSignedAttachmentUrl(
      () => useSignedAttachmentUrl(ref('11111111-1111-4111-8111-111111111111')),
      '<span>{{ url }}</span>',
    )
    await flushAttachmentUrl()
    expect(wrapper.text()).toBe('')
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledOnce()

    window.dispatchEvent(new Event('online'))
    await flushAttachmentUrl()
    expect(wrapper.text()).toBe('/reconnected.png')
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(270_000)
    await flushAttachmentUrl()
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(3)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(10_000)
    window.dispatchEvent(new Event('online'))
    await flushAttachmentUrl()
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(3)
  })

  it('does not fetch while disabled and clears existing URL', async () => {
    const enabled = ref(false)
    const wrapper = mountUseSignedAttachmentUrl(
      () =>
        useSignedAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
          disposition: ATTACHMENT_DISPOSITION_INLINE,
          enabled,
        }),
      '<span>{{ url }}</span>',
    )

    await nextTick()
    expect(resolveSignedAttachmentUrlMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toBe('')

    enabled.value = true
    await flushAttachmentUrl()

    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toBe('/api/attachments/1/content?token=token')

    enabled.value = false
    await nextTick()

    expect(wrapper.text()).toBe('')
  })

  it('ignores stale content-url result after becoming disabled', async () => {
    const enabled = ref(true)
    const pending = createDeferred<ResolvedUrlResult>()
    resolveSignedAttachmentUrlMock.mockImplementationOnce(() => pending.promise)

    const wrapper = mountUseSignedAttachmentUrl(
      () =>
        useSignedAttachmentUrl(ref('11111111-1111-4111-8111-111111111111'), {
          enabled,
        }),
      '<span>{{ url }}|{{ expiresAt }}|{{ isLoading }}</span>',
    )

    await nextTick()
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('true')

    enabled.value = false
    await nextTick()

    expect(wrapper.text()).toBe('||false')

    pending.resolve(
      resolveUrl('/api/attachments/stale/content?token=stale', '2026-05-29T01:00:00.000Z'),
    )
    await flushAttachmentUrl()

    expect(wrapper.text()).toBe('||false')
  })

  it('ignores stale result when id changes during pending request', async () => {
    const id = ref('11111111-1111-4111-8111-111111111111')
    const oldRequest = createDeferred<ResolvedUrlResult>()
    resolveSignedAttachmentUrlMock.mockImplementationOnce(() => oldRequest.promise)
    resolveSignedAttachmentUrlMock.mockResolvedValueOnce(
      resolveUrl('/api/attachments/new/content?token=new', '2026-05-29T02:00:00.000Z'),
    )

    const wrapper = mountUseSignedAttachmentUrl(
      () => useSignedAttachmentUrl(id),
      '<span>{{ url }}</span>',
    )

    await nextTick()
    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(1)

    id.value = '22222222-2222-4222-8222-222222222222'
    await flushAttachmentUrl()

    expect(resolveSignedAttachmentUrlMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toBe('/api/attachments/new/content?token=new')

    oldRequest.resolve(
      resolveUrl('/api/attachments/old/content?token=old', '2026-05-29T03:00:00.000Z'),
    )
    await flushAttachmentUrl()

    expect(wrapper.text()).toBe('/api/attachments/new/content?token=new')
  })

  it('clears current URL while loading the next attachment', async () => {
    const id = ref('11111111-1111-4111-8111-111111111111')
    const requestA = createDeferred<ResolvedUrlResult>()
    const requestB = createDeferred<ResolvedUrlResult>()

    resolveSignedAttachmentUrlMock
      .mockImplementationOnce(() => requestA.promise)
      .mockImplementationOnce(() => requestB.promise)

    const wrapper = mountUseSignedAttachmentUrl(
      () => useSignedAttachmentUrl(id),
      '<span>{{ url }}|{{ expiresAt }}|{{ isLoading }}</span>',
    )

    await nextTick()
    expect(wrapper.text()).toBe('||true')

    requestA.resolve(resolveUrl('/api/attachments/a/content?token=a', '2026-05-29T04:00:00.000Z'))
    await flushAttachmentUrl()

    expect(wrapper.text()).toBe('/api/attachments/a/content?token=a|2026-05-29T04:00:00.000Z|false')

    id.value = '22222222-2222-4222-8222-222222222222'
    await nextTick()

    expect(wrapper.text()).toBe('||true')

    requestB.resolve(resolveUrl('/api/attachments/b/content?token=b', '2026-05-29T05:00:00.000Z'))
    await flushAttachmentUrl()

    expect(wrapper.text()).toBe('/api/attachments/b/content?token=b|2026-05-29T05:00:00.000Z|false')
  })

  it('clears URL and exposes error when content-url request rejects', async () => {
    const id = ref('11111111-1111-4111-8111-111111111111')
    const first = createDeferred<ResolvedUrlResult>()
    const failed = createDeferred<ResolvedUrlResult>()
    resolveSignedAttachmentUrlMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => failed.promise)

    const wrapper = mountUseSignedAttachmentUrl(
      () => useSignedAttachmentUrl(id),
      '<span>{{ url }}|{{ expiresAt }}|{{ isLoading }}|{{ error ? "error" : "" }}</span>',
    )

    await nextTick()
    first.resolve(resolveUrl('/api/attachments/a/content?token=a', '2026-05-29T06:00:00.000Z'))
    await flushAttachmentUrl()
    expect(wrapper.text()).toBe(
      '/api/attachments/a/content?token=a|2026-05-29T06:00:00.000Z|false|',
    )

    id.value = '22222222-2222-4222-8222-222222222222'
    await nextTick()
    expect(wrapper.text()).toBe('||true|')

    failed.reject(new Error('request failed'))
    await flushAttachmentUrl()

    expect(wrapper.text()).toBe('||false|error')
  })
})
