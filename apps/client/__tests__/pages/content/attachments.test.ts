import bytes from 'bytes'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NPagination, NSelect } from 'naive-ui'
import {
  ATTACHMENT_USAGE_AVATAR,
  ATTACHMENT_USAGE_GENERAL,
  type AttachmentListItem,
  type AttachmentListResponse,
  type AuthTokenResponse,
} from '@rev30/contracts'
import { computed } from 'vue'
import { deleteAttachment, listAttachments, useAttachmentUrl } from '../../../src/features/attachments'
import AttachmentsPage from '../../../src/pages/index/content/attachments.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

vi.mock('../../../src/features/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/attachments')>()),
  deleteAttachment: vi.fn(),
  listAttachments: vi.fn(),
  useAttachmentUrl: vi.fn(),
}))

const deleteAttachmentMock = vi.mocked(deleteAttachment)
const listAttachmentsMock = vi.mocked(listAttachments)
const useAttachmentUrlMock = vi.mocked(useAttachmentUrl)

const authSession: AuthTokenResponse = {
  ...session,
  accessCodes: ['content:attachment:list', 'content:attachment:delete'],
}

const avatarAttachment: AttachmentListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  originalName: 'avatar.png',
  mimeType: 'image/png',
  extension: 'png',
  size: 2048,
  usage: ATTACHMENT_USAGE_AVATAR,
  createdAt: '2026-05-21T00:00:00.000Z',
  createdBy: {
    id: '21111111-1111-4111-8111-111111111111',
    username: 'ada',
    nickname: 'Ada Lovelace',
  },
}

const generalAttachment: AttachmentListItem = {
  id: '22222222-2222-4111-8111-111111111112',
  originalName: 'document.pdf',
  mimeType: 'application/pdf',
  extension: 'pdf',
  size: 1024,
  usage: ATTACHMENT_USAGE_GENERAL,
  createdAt: '2026-05-22T00:00:00.000Z',
  createdBy: {
    id: '22222222-1111-4111-8111-111111111111',
    username: 'linus',
    nickname: 'Linus',
  },
}

const attachmentsResponse: AttachmentListResponse = {
  list: [avatarAttachment, generalAttachment],
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
    useAttachmentUrlMock.mockReset()
    useAttachmentUrlMock.mockReturnValue({
      url: computed(() => 'https://cdn.example.com/avatar.png'),
      expiresAt: computed(() => '2026-05-21T01:00:00.000Z'),
      error: computed(() => null),
      isLoading: computed(() => false),
      refresh: async () => {},
    })
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    document.body.innerHTML = ''
    stubPreferredDark(false)
  })

  afterEach(() => {
    disposeActiveTestPinia()
    vi.unstubAllGlobals()
  })

  it('loads and renders attachment resources', async () => {
    listAttachmentsMock.mockResolvedValue(attachmentsResponse)
    const { wrapper } = await mountAttachmentsPage()
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('附件资源')
    expect(wrapper.text()).toContain(avatarAttachment.originalName)
    expect(wrapper.text()).toContain(avatarAttachment.mimeType)
    expect(wrapper.text()).toContain(bytes.format(2048))
    expect(wrapper.text()).toContain(
      `${avatarAttachment.createdBy.nickname} (${avatarAttachment.createdBy.username})`,
    )
    expect(wrapper.find('[data-test="attachments-preview-image"]').attributes('src')).toBe(
      'https://cdn.example.com/avatar.png',
    )
  })

  it('searches by keyword and usage', async () => {
    listAttachmentsMock.mockResolvedValue(attachmentsResponse)
    const { wrapper } = await mountAttachmentsPage()
    await flushPromises()

    await wrapper.find('[data-test="attachments-keyword"] input').setValue('  avatar  ')
    wrapper
      .get('[data-test="attachments-usage"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ATTACHMENT_USAGE_AVATAR)
    await flushPromises()
    await wrapper.get('[data-test="attachments-search"]').trigger('click')
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'avatar',
      usage: ATTACHMENT_USAGE_AVATAR,
    })
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

    expect(deleteAttachmentMock).toHaveBeenCalledWith(avatarAttachment.id)
    expect(listAttachmentsMock).toHaveBeenCalledTimes(2)
    expect(listAttachmentsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('keeps applied filters when changing page', async () => {
    listAttachmentsMock.mockResolvedValue(attachmentsResponse)
    const { wrapper } = await mountAttachmentsPage()
    await flushPromises()

    await wrapper.find('[data-test="attachments-keyword"] input').setValue('  avatar  ')
    wrapper
      .get('[data-test="attachments-usage"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ATTACHMENT_USAGE_AVATAR)
    await flushPromises()
    await wrapper.get('[data-test="attachments-search"]').trigger('click')
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listAttachmentsMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      keyword: 'avatar',
      usage: ATTACHMENT_USAGE_AVATAR,
    })
  })
})
