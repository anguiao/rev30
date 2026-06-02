import { flushPromises, mount } from '@vue/test-utils'
import { PiniaColada } from '@pinia/colada'
import { ATTACHMENT_DISPOSITION_INLINE } from '@rev30/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import {
  resolveSignedAttachmentUrl,
  useSignedAttachmentUrl,
} from '../../../src/features/attachments'
import { createTestPinia } from '../../helpers/pinia'

vi.mock('../../../src/features/attachments/requests', () => ({
  resolveSignedAttachmentUrl: vi.fn(),
}))

const resolveSignedAttachmentUrlMock = vi.mocked(resolveSignedAttachmentUrl)
type ResolvedUrlResult = { expiresAt: string; url: string }
let pinia: ReturnType<typeof createTestPinia>

function resolveUrl(url: string, expiresAt: string): ResolvedUrlResult {
  return {
    expiresAt,
    url,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, reject, resolve }
}

function mountUseSignedAttachmentUrl(
  setup: () => ReturnType<typeof useSignedAttachmentUrl>,
  template: string,
) {
  return mount(defineComponent({ setup, template }), {
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
}

async function flushAttachmentUrl() {
  await nextTick()
  await flushPromises()
  await nextTick()
}

beforeEach(() => {
  pinia = createTestPinia()
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

  it('clears current URL while loading next id and ignores stale previous response', async () => {
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
