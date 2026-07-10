import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, toValue } from 'vue'
import {
  ATTACHMENT_DISPOSITION_INLINE,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ATTACHMENT_READ_POLICY_SIGNED,
  type AttachmentListItem,
} from '@rev30/contracts'
import AttachmentPreviewCell from '../../../src/features/attachments/AttachmentPreviewCell.vue'
import { getAttachmentContentUrl } from '../../../src/features/attachments/requests'
import { useSignedAttachmentUrl } from '../../../src/features/attachments/useSignedAttachmentUrl'

vi.mock('../../../src/features/attachments/useSignedAttachmentUrl', () => ({
  useSignedAttachmentUrl: vi.fn(),
}))

const useSignedAttachmentUrlMock = vi.mocked(useSignedAttachmentUrl)

const authenticatedImage: AttachmentListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 123,
  usage: 'avatar',
  readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
  createdAt: '2026-06-02T00:00:00.000Z',
  createdBy: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    username: 'ada',
    nickname: 'Ada',
  },
}

const signedImage: AttachmentListItem = {
  ...authenticatedImage,
  id: '22222222-2222-4222-8222-222222222222',
  originalName: 'report.png',
  readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
}

const documentAttachment: AttachmentListItem = {
  ...authenticatedImage,
  id: '33333333-3333-4333-8333-333333333333',
  originalName: 'report.pdf',
  mimeType: 'application/pdf',
  extension: 'pdf',
  readPolicy: ATTACHMENT_READ_POLICY_SIGNED,
}

let signedUrl = ref<string | null>(null)
let signedError = ref<Error | null>(null)
let signedLoading = ref(false)

function createSignedAttachmentState() {
  return {
    url: computed(() => signedUrl.value),
    expiresAt: computed(() => null),
    error: computed(() => signedError.value),
    isLoading: computed(() => signedLoading.value),
    refresh: vi.fn(async () => {}),
  }
}

function mountPreview(attachment: AttachmentListItem) {
  return mount(AttachmentPreviewCell, {
    props: {
      attachment,
    },
  })
}

describe('AttachmentPreviewCell', () => {
  beforeEach(() => {
    signedUrl = ref(null)
    signedError = ref(null)
    signedLoading = ref(false)
    useSignedAttachmentUrlMock.mockReset()
    useSignedAttachmentUrlMock.mockImplementation(() => createSignedAttachmentState())
  })

  it('renders authenticated images and falls back when the image fails to load', async () => {
    const wrapper = mountPreview(authenticatedImage)
    const image = wrapper.get('img')

    expect(image.attributes('src')).toBe(getAttachmentContentUrl(authenticatedImage.id))
    expect(image.attributes('alt')).toBe(authenticatedImage.originalName)

    const [attachmentId, unsafeOptions] = useSignedAttachmentUrlMock.mock.calls[0]!
    const options = unsafeOptions!
    expect(toValue(attachmentId)).toBe(authenticatedImage.id)
    expect(toValue(options.disposition)).toBe(ATTACHMENT_DISPOSITION_INLINE)
    expect(toValue(options.enabled)).toBe(false)

    await image.trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[data-test="attachments-preview-icon"]').classes()).toContain(
      'i-[lucide--image]',
    )
  })

  it('uses signed URLs and falls back while loading or after resolving fails', async () => {
    signedLoading.value = true
    const wrapper = mountPreview(signedImage)
    const [, unsafeOptions] = useSignedAttachmentUrlMock.mock.calls[0]!
    const options = unsafeOptions!

    expect(toValue(options.enabled)).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('[data-test="attachments-preview-icon"]').exists()).toBe(true)

    signedLoading.value = false
    signedUrl.value = 'https://cdn.example.com/report.png'
    await nextTick()

    expect(wrapper.get('img').attributes('src')).toBe('https://cdn.example.com/report.png')

    signedError.value = new Error('content URL failed')
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('[data-test="attachments-preview-icon"]').exists()).toBe(true)
  })

  it('renders a file icon for non-image attachments without enabling signed URL loading', () => {
    const wrapper = mountPreview(documentAttachment)
    const [, unsafeOptions] = useSignedAttachmentUrlMock.mock.calls[0]!
    const options = unsafeOptions!

    expect(toValue(options.enabled)).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[data-test="attachments-preview-icon"]').classes()).toContain(
      'i-[lucide--file]',
    )
  })

  it('recovers from an image error and resolves the new attachment id after props change', async () => {
    useSignedAttachmentUrlMock.mockImplementation((attachmentId) => ({
      ...createSignedAttachmentState(),
      url: computed(() => `https://cdn.example.com/${toValue(attachmentId)}.png`),
    }))
    const wrapper = mountPreview(signedImage)

    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)

    const nextAttachment = {
      ...signedImage,
      id: '44444444-4444-4444-8444-444444444444',
      originalName: 'next.png',
    }
    await wrapper.setProps({ attachment: nextAttachment })

    const [attachmentId] = useSignedAttachmentUrlMock.mock.calls[0]!
    expect(toValue(attachmentId)).toBe(nextAttachment.id)
    expect(wrapper.get('img').attributes('src')).toBe(
      `https://cdn.example.com/${nextAttachment.id}.png`,
    )
    expect(wrapper.get('img').attributes('alt')).toBe(nextAttachment.originalName)
  })
})
