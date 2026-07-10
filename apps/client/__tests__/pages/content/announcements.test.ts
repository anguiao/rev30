import { useQueryCache } from '@pinia/colada'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { NDataTable, NPagination, NSelect } from 'naive-ui'
import {
  ANNOUNCEMENT_STATUS_ARCHIVED,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  type AnnouncementListItem,
  type AnnouncementListResponse,
  type AuthTokenResponse,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { defineComponent, h } from 'vue'
import {
  archiveAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  publishAnnouncement,
} from '../../../src/features/content'
import AnnouncementsPage from '../../../src/pages/index/content/announcements.vue'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/content/AnnouncementFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'AnnouncementFormDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      announcementId: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-announcement-id': props.announcementId ?? '',
          'data-show': String(props.show),
          'data-test': 'announcement-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  archiveAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  listAnnouncements: vi.fn(),
  publishAnnouncement: vi.fn(),
}))

const archiveAnnouncementMock = vi.mocked(archiveAnnouncement)
const deleteAnnouncementMock = vi.mocked(deleteAnnouncement)
const listAnnouncementsMock = vi.mocked(listAnnouncements)
const publishAnnouncementMock = vi.mocked(publishAnnouncement)

const authSession: AuthTokenResponse = {
  ...session,
  accessCodes: [
    'content:announcement:list',
    'content:announcement:create',
    'content:announcement:update',
    'content:announcement:delete',
  ],
}

const draftAnnouncement: AnnouncementListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '请关注维护窗口',
  visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
  status: ANNOUNCEMENT_STATUS_DRAFT,
  pinned: true,
  publishedAt: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T01:00:00.000Z',
  readStats: null,
}

const publishedAnnouncement: AnnouncementListItem = {
  id: '22222222-2222-4111-8111-111111111112',
  type: ANNOUNCEMENT_TYPE_BULLETIN,
  title: '版本上线公告',
  summary: '新版功能已发布',
  visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
  status: ANNOUNCEMENT_STATUS_PUBLISHED,
  pinned: false,
  publishedAt: '2026-05-21T00:00:00.000Z',
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-21T01:00:00.000Z',
  readStats: {
    recipientCount: 3,
    readCount: 1,
    unreadCount: 2,
  },
}

const archivedAnnouncement: AnnouncementListItem = {
  id: '33333333-3333-4111-8111-111111111113',
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '历史通知',
  summary: null,
  visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
  status: ANNOUNCEMENT_STATUS_ARCHIVED,
  pinned: false,
  publishedAt: '2026-05-19T00:00:00.000Z',
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-22T01:00:00.000Z',
  readStats: {
    recipientCount: 2,
    readCount: 2,
    unreadCount: 0,
  },
}

const announcementsResponse: AnnouncementListResponse = {
  list: [draftAnnouncement, publishedAnnouncement, archivedAnnouncement],
  total: 3,
  page: 1,
  pageSize: 20,
}

async function mountAnnouncementsPage(nextSession: AuthTokenResponse = authSession) {
  return mountAuthRoute(
    '/content/announcements',
    [{ path: '/content/announcements', component: AnnouncementsPage }],
    nextSession,
  )
}

describe('announcements page', () => {
  beforeEach(() => {
    archiveAnnouncementMock.mockReset()
    deleteAnnouncementMock.mockReset()
    listAnnouncementsMock.mockReset()
    publishAnnouncementMock.mockReset()
    stubPreferredDark(false)
  })

  it('loads and renders announcements with tags and pagination', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    expect(listAnnouncementsMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('通知公告')
    expect(wrapper.text()).toContain('共 3 条')
    expect(wrapper.text()).toContain(draftAnnouncement.title)
    expect(wrapper.text()).toContain('通知')
    expect(wrapper.text()).toContain('草稿')
    expect(wrapper.text()).toContain('置顶')
    expect(wrapper.text()).toContain('1/3')
    expect(wrapper.text()).toContain('2/2')
    expect(wrapper.text()).toContain(formatDisplayDateTime(publishedAnnouncement.publishedAt!))
    expect(wrapper.text()).toContain(formatDisplayDateTime(archivedAnnouncement.updatedAt))
    expect(wrapper.getComponent(NDataTable).props('pagination')).toBe(false)
    expect(wrapper.findComponent(NPagination).exists()).toBe(true)
  })

  it('searches with trimmed keyword and selected filters, and reset returns default query', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.find('[data-test="announcements-keyword"] input').setValue('  维护通知  ')
    wrapper
      .get('[data-test="announcements-type"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ANNOUNCEMENT_TYPE_NOTICE)
    wrapper
      .get('[data-test="announcements-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ANNOUNCEMENT_STATUS_DRAFT)
    wrapper
      .get('[data-test="announcements-pinned"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', 'true')
    await flushPromises()
    await wrapper.get('[data-test="announcements-search"]').trigger('click')
    await flushPromises()
    const callCountAfterSearch = listAnnouncementsMock.mock.calls.length

    expect(listAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: '维护通知',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      status: ANNOUNCEMENT_STATUS_DRAFT,
      pinned: true,
    })

    const queryCache = useQueryCache()
    const initialQueryEntry = queryCache.get([
      'content',
      'announcements',
      'list',
      1,
      20,
      '',
      'all',
      'all',
      'all',
    ])
    if (initialQueryEntry !== undefined) {
      queryCache.remove(initialQueryEntry)
    }

    await wrapper.get('[data-test="announcements-reset"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(listAnnouncementsMock.mock.calls.length).toBe(callCountAfterSearch + 1)
    })
    expect(listAnnouncementsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })

    expect(
      (wrapper.get('[data-test="announcements-keyword"] input').element as HTMLInputElement).value,
    ).toBe('')
    expect(
      wrapper.get('[data-test="announcements-type"]').getComponent(NSelect).props('value'),
    ).toBe('all')
    expect(
      wrapper.get('[data-test="announcements-status"]').getComponent(NSelect).props('value'),
    ).toBe('all')
    expect(
      wrapper.get('[data-test="announcements-pinned"]').getComponent(NSelect).props('value'),
    ).toBe('all')

    const callCountAfterFirstReset = listAnnouncementsMock.mock.calls.length
    await wrapper.get('[data-test="announcements-reset"]').trigger('click')
    await flushPromises()

    expect(listAnnouncementsMock.mock.calls.length).toBe(callCountAfterFirstReset)
  })

  it('keeps applied filters when changing page after search', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.find('[data-test="announcements-keyword"] input').setValue('  维护通知  ')
    wrapper
      .get('[data-test="announcements-type"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ANNOUNCEMENT_TYPE_NOTICE)
    wrapper
      .get('[data-test="announcements-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ANNOUNCEMENT_STATUS_DRAFT)
    wrapper
      .get('[data-test="announcements-pinned"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', 'true')
    await flushPromises()
    await wrapper.get('[data-test="announcements-search"]').trigger('click')
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      keyword: '维护通知',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      status: ANNOUNCEMENT_STATUS_DRAFT,
      pinned: true,
    })
  })

  it('shows create and row actions according to permissions', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    const { wrapper: unauthorizedWrapper } = await mountAnnouncementsPage({
      ...authSession,
      accessCodes: [],
    })
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="announcements-create"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="announcements-edit"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="announcements-publish"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="announcements-archive"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="announcements-delete"]').exists()).toBe(false)

    const { wrapper: writeWithoutListWrapper } = await mountAnnouncementsPage({
      ...authSession,
      accessCodes: [
        'content:announcement:create',
        'content:announcement:update',
        'content:announcement:delete',
      ],
    })
    await flushPromises()

    expect(writeWithoutListWrapper.find('[data-test="announcements-create"]').exists()).toBe(false)
    expect(writeWithoutListWrapper.find('[data-test="announcements-edit"]').exists()).toBe(false)
    expect(writeWithoutListWrapper.find('[data-test="announcements-publish"]').exists()).toBe(false)
    expect(writeWithoutListWrapper.find('[data-test="announcements-delete"]').exists()).toBe(true)

    const { wrapper: authorizedWrapper } = await mountAnnouncementsPage()
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="announcements-create"]').exists()).toBe(true)
    expect(authorizedWrapper.findAll('[data-test="announcements-edit"]')).toHaveLength(3)
    expect(authorizedWrapper.findAll('[data-test="announcements-publish"]')).toHaveLength(2)
    expect(authorizedWrapper.findAll('[data-test="announcements-archive"]')).toHaveLength(1)
    expect(authorizedWrapper.findAll('[data-test="announcements-delete"]')).toHaveLength(3)
  })

  it('shows publish and archive actions by row status', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    const draftRow = rows[0]!
    const publishedRow = rows[1]!
    const archivedRow = rows[2]!

    expect(draftRow.text()).toContain(draftAnnouncement.title)
    expect(draftRow.find('[data-test="announcements-publish"]').exists()).toBe(true)
    expect(draftRow.find('[data-test="announcements-archive"]').exists()).toBe(false)

    expect(publishedRow.text()).toContain(publishedAnnouncement.title)
    expect(publishedRow.find('[data-test="announcements-publish"]').exists()).toBe(false)
    expect(publishedRow.find('[data-test="announcements-archive"]').exists()).toBe(true)

    expect(archivedRow.text()).toContain(archivedAnnouncement.title)
    expect(archivedRow.find('[data-test="announcements-publish"]').exists()).toBe(true)
    expect(archivedRow.find('[data-test="announcements-archive"]').exists()).toBe(false)
  })

  it('opens create and edit drawers with the correct announcement id', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="announcements-create"]').trigger('click')
    await flushPromises()

    let drawer = wrapper.get('[data-test="announcement-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-announcement-id')).toBe('')

    await wrapper.get('[data-test="announcements-edit"]').trigger('click')
    await flushPromises()

    drawer = wrapper.get('[data-test="announcement-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-announcement-id')).toBe(draftAnnouncement.id)
  })

  it('shows success and refreshes list after drawer saved', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="announcements-create"]').trigger('click')
    await flushPromises()
    wrapper.getComponent({ name: 'AnnouncementFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(document.body.textContent).toContain('保存通知公告成功')
    expect(listAnnouncementsMock).toHaveBeenCalledTimes(2)
    expect(listAnnouncementsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('publishes after confirmation and refreshes list', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    publishAnnouncementMock.mockResolvedValue(undefined)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="announcements-publish"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="announcements-publish-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(publishAnnouncementMock).toHaveBeenCalledWith(draftAnnouncement.id)
    expect(listAnnouncementsMock).toHaveBeenCalledTimes(2)
    expect(listAnnouncementsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(document.body.textContent).toContain('发布通知公告成功')
  })

  it('shows backend error and keeps list untouched when publish fails', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    publishAnnouncementMock.mockRejectedValue(new ApiRequestError(409, '当前状态不能发布'))
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="announcements-publish"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="announcements-publish-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(publishAnnouncementMock).toHaveBeenCalledWith(draftAnnouncement.id)
    expect(listAnnouncementsMock).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('当前状态不能发布')
    expect(document.body.textContent).not.toContain('发布通知公告成功')
    expect(
      document.body.querySelector('[data-test="announcements-publish-confirm"]'),
    ).not.toBeNull()
  })

  it('invalidates cached default list after a successful publish', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    publishAnnouncementMock.mockResolvedValue(undefined)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.find('[data-test="announcements-keyword"] input').setValue('  维护通知  ')
    wrapper
      .get('[data-test="announcements-type"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ANNOUNCEMENT_TYPE_NOTICE)
    wrapper
      .get('[data-test="announcements-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', ANNOUNCEMENT_STATUS_DRAFT)
    wrapper
      .get('[data-test="announcements-pinned"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', 'true')
    await flushPromises()
    await wrapper.get('[data-test="announcements-search"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-test="announcements-publish"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="announcements-publish-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(listAnnouncementsMock).toHaveBeenNthCalledWith(3, {
      page: 1,
      pageSize: 20,
      keyword: '维护通知',
      type: ANNOUNCEMENT_TYPE_NOTICE,
      status: ANNOUNCEMENT_STATUS_DRAFT,
      pinned: true,
    })

    await wrapper.get('[data-test="announcements-reset"]').trigger('click')
    await flushPromises()

    expect(listAnnouncementsMock).toHaveBeenCalledTimes(4)
    expect(listAnnouncementsMock).toHaveBeenNthCalledWith(4, { page: 1, pageSize: 20 })
  })

  it('archives after confirmation and refreshes list', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    archiveAnnouncementMock.mockResolvedValue(undefined)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="announcements-archive"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="announcements-archive-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(archiveAnnouncementMock).toHaveBeenCalledWith(publishedAnnouncement.id)
    expect(listAnnouncementsMock).toHaveBeenCalledTimes(2)
    expect(listAnnouncementsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(document.body.textContent).toContain('归档通知公告成功')
  })

  it('deletes after confirmation and refreshes list', async () => {
    listAnnouncementsMock.mockResolvedValue(announcementsResponse)
    deleteAnnouncementMock.mockResolvedValue(undefined)
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="announcements-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="announcements-delete-confirm"]',
    ) as HTMLButtonElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteAnnouncementMock).toHaveBeenCalledWith(draftAnnouncement.id)
    expect(listAnnouncementsMock).toHaveBeenCalledTimes(2)
    expect(listAnnouncementsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
    expect(document.body.textContent).toContain('删除通知公告成功')
  })
})
