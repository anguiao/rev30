import bytes from 'bytes'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NPagination } from 'naive-ui'
import {
  type AttachmentListItem,
  type AttachmentListResponse,
  type AuthTokenResponse,
} from '@rev30/contracts'
import { computed } from 'vue'
import { deleteAttachment, listAttachments } from '../../../src/features/attachments'
import { useSignedAttachmentUrl } from '../../../src/features/attachments/useSignedAttachmentUrl'
import AttachmentsPage from '../../../src/pages/index/content/attachments.vue'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/attachments')>()),
  deleteAttachment: vi.fn(),
  listAttachments: vi.fn(),
}))

vi.mock('../../../src/features/attachments/useSignedAttachmentUrl', () => ({
  useSignedAttachmentUrl: vi.fn(),
}))

const deleteAttachmentMock = vi.mocked(deleteAttachment)
const listAttachmentsMock = vi.mocked(listAttachments)
const useSignedAttachmentUrlMock = vi.mocked(useSignedAttachmentUrl)

const authSession: AuthTokenResponse = {
  ...session,
  accessCodes: ['content:attachment:list', 'content:attachment:delete'],
}

const authenticatedImage: AttachmentListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 123,
  usage: 'avatar',
  readPolicy: 'authenticated',
  createdAt: '2026-06-02T00:00:00.000Z',
  createdBy: {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'ada',
    nickname: 'Ada',
  },
}

const signedImage: AttachmentListItem = {
  id: '22222222-2222-4111-8111-111111111112',
  originalName: 'report.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 1024,
  usage: 'custom-report',
  readPolicy: 'signed',
  createdAt: '2026-05-22T00:00:00.000Z',
  createdBy: {
    id: '33333333-3333-4333-8333-333333333333',
    username: 'linus',
    nickname: 'Linus',
  },
}

const attachmentsResponse: AttachmentListResponse = {
  list: [authenticatedImage, signedImage],
  total: 2,
  page: 1,
  pageSize: 20,
}

async function mountAttachmentsPage(nextSession: AuthTokenResponse = authSession) {
  return mountAuthRoute(
    '/content/attachments',
    [{ path: '/content/attachments', component: AttachmentsPage }],
    nextSession,
  )
}

describe('attachments page', () => {
  beforeEach(() => {
    deleteAttachmentMock.mockReset()
    listAttachmentsMock.mockReset()
    useSignedAttachmentUrlMock.mockReset()
    useSignedAttachmentUrlMock.mockReturnValue({
      url: computed(() => 'https://cdn.example.com/avatar.png'),
      expiresAt: computed(() => '2026-05-21T01:00:00.000Z'),
      error: computed(() => null),
      isLoading: computed(() => false),
      refresh: async () => {},
    })
    stubPreferredDark(false)
  })

  it('loads and renders attachment resources', async () => {
    listAttachmentsMock.mockResolvedValue(attachmentsResponse)
    const { wrapper } = await mountAttachmentsPage()
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('附件资源')
    expect(wrapper.text()).toContain(authenticatedImage.originalName)
    expect(wrapper.text()).toContain(authenticatedImage.mimeType)
    expect(wrapper.text()).toContain(bytes.format(123))
    expect(wrapper.text()).toContain('custom-report')
    expect(wrapper.text()).toContain(
      `${authenticatedImage.createdBy.nickname} (${authenticatedImage.createdBy.username})`,
    )
    expect(wrapper.findAll('img').map((image) => image.attributes('alt'))).toEqual(
      expect.arrayContaining([authenticatedImage.originalName, signedImage.originalName]),
    )
  })

  it('searches by keyword and usage', async () => {
    listAttachmentsMock.mockResolvedValue(attachmentsResponse)
    const { wrapper } = await mountAttachmentsPage()
    await flushPromises()

    await wrapper.find('[data-test="attachments-keyword"] input').setValue('  avatar  ')
    const usageInput = wrapper.find('[data-test="attachments-usage"] input')
    expect(usageInput.exists()).toBe(true)
    await usageInput.setValue('custom-report')
    await wrapper.get('[data-test="attachments-search"]').trigger('click')
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        keyword: 'avatar',
        usage: 'custom-report',
      }),
    )

    await wrapper.find('[data-test="attachments-reset"]').trigger('click')
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenLastCalledWith(
      expect.not.objectContaining({
        usage: expect.any(String),
      }),
    )
  })

  it('deletes after confirmation and refreshes list', async () => {
    listAttachmentsMock.mockResolvedValue(attachmentsResponse)
    deleteAttachmentMock.mockResolvedValue(undefined)
    const { wrapper } = await mountAttachmentsPage()
    await flushPromises()

    await wrapper.get('[data-test="attachments-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="attachments-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteAttachmentMock).toHaveBeenCalledWith(authenticatedImage.id)
    expect(listAttachmentsMock).toHaveBeenCalledTimes(2)
    expect(listAttachmentsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('keeps applied filters when changing page', async () => {
    listAttachmentsMock.mockResolvedValue(attachmentsResponse)
    const { wrapper } = await mountAttachmentsPage()
    await flushPromises()

    await wrapper.find('[data-test="attachments-keyword"] input').setValue('  avatar  ')
    const usageInput = wrapper.find('[data-test="attachments-usage"] input')
    expect(usageInput.exists()).toBe(true)
    await usageInput.setValue('custom-report')
    await wrapper.get('[data-test="attachments-search"]').trigger('click')
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      keyword: 'avatar',
      usage: 'custom-report',
    })
  })
})
