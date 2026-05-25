import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  type AnnouncementMyDetail,
  type AnnouncementMyListItem,
  type AnnouncementMyListResponse,
} from '@rev30/contracts'
import { defineComponent, h } from 'vue'
import AccountAnnouncementsPage from '../../../src/pages/account/announcements.vue'
import { getMyAnnouncement, listMyAnnouncements } from '../../../src/features/content'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

vi.mock('../../../src/features/content/AnnouncementDetailDrawer.vue', () => ({
  default: defineComponent({
    name: 'AnnouncementDetailDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      detail: {
        type: Object,
        default: null,
      },
      loading: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:show'],
    setup(props) {
      return () =>
        h('div', {
          'data-test': 'announcement-detail-drawer',
          'data-show': String(props.show),
          'data-loading': String(props.loading),
          'data-detail-id': props.detail?.id ?? '',
          'data-detail-title': props.detail?.title ?? '',
        })
    },
  }),
}))

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  listMyAnnouncements: vi.fn(),
  getMyAnnouncement: vi.fn(),
}))

const listMyAnnouncementsMock = vi.mocked(listMyAnnouncements)
const getMyAnnouncementMock = vi.mocked(getMyAnnouncement)

const noticeItem: AnnouncementMyListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '请提前保存工作内容',
  pinned: true,
  publishedAt: '2026-05-24T08:30:00.000Z',
}

const bulletinItem: AnnouncementMyListItem = {
  id: '22222222-2222-4111-8111-111111111112',
  type: ANNOUNCEMENT_TYPE_BULLETIN,
  title: '版本公告',
  summary: '新版本已经发布',
  pinned: false,
  publishedAt: '2026-05-23T08:30:00.000Z',
}

const listResponse: AnnouncementMyListResponse = {
  list: [noticeItem, bulletinItem],
  total: 2,
  page: 1,
  pageSize: 20,
}

const detailResponse: AnnouncementMyDetail = {
  ...noticeItem,
  contentHtml: '<p>维护详情</p>',
}

const bulletinDetailResponse: AnnouncementMyDetail = {
  ...bulletinItem,
  contentHtml: '<p>版本详情</p>',
}

async function mountAnnouncementsPage() {
  return mountAuthRoute(
    '/account/announcements',
    [
      { path: '/', component: { template: '<main>Home</main>' } },
      { path: '/account/announcements', component: AccountAnnouncementsPage },
    ],
    session,
  )
}

describe('account announcements page', () => {
  beforeEach(() => {
    listMyAnnouncementsMock.mockReset()
    getMyAnnouncementMock.mockReset()
    listMyAnnouncementsMock.mockResolvedValue(listResponse)
    getMyAnnouncementMock.mockResolvedValue(detailResponse)
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

  it('loads notice announcements by default', async () => {
    await mountAnnouncementsPage()
    await flushPromises()

    expect(listMyAnnouncementsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      type: ANNOUNCEMENT_TYPE_NOTICE,
    })
  })

  it('loads bulletin announcements after clicking the bulletin tab', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    const bulletinTab = wrapper.findAll('.n-tabs-tab').find((tab) => tab.text() === '公告')

    expect(bulletinTab).toBeDefined()

    await bulletinTab!.trigger('click')
    await flushPromises()

    expect(listMyAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      type: ANNOUNCEMENT_TYPE_BULLETIN,
    })
  })

  it('searches with a trimmed keyword', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.find('[data-test="my-announcements-keyword"] input').setValue('  维护通知  ')
    await wrapper.get('[data-test="my-announcements-search"]').trigger('click')
    await flushPromises()

    expect(listMyAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      keyword: '维护通知',
    })
  })

  it('loads detail and opens the drawer when a list item is clicked', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="my-announcements-list-item"]').trigger('click')
    await flushPromises()

    expect(getMyAnnouncementMock).toHaveBeenCalledWith(noticeItem.id)
    expect(wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-show')).toBe(
      'true',
    )
    expect(
      wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-detail-id'),
    ).toBe(detailResponse.id)
    expect(
      wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-detail-title'),
    ).toBe(detailResponse.title)
  })

  it('does not show the empty state while the list is loading', async () => {
    let resolveList!: (value: AnnouncementMyListResponse) => void

    listMyAnnouncementsMock.mockReturnValue(
      new Promise<AnnouncementMyListResponse>((resolve) => {
        resolveList = resolve
      }),
    )

    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    expect(wrapper.text()).not.toContain('暂无通知公告')

    resolveList(listResponse)
    await flushPromises()

    expect(wrapper.text()).toContain(noticeItem.title)
  })

  it('clears stale detail when the next detail request fails', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="my-announcements-list-item"]').trigger('click')
    await flushPromises()

    expect(
      wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-detail-id'),
    ).toBe(detailResponse.id)

    getMyAnnouncementMock.mockRejectedValueOnce(new Error('load failed'))

    await wrapper.findAll('[data-test="my-announcements-list-item"]')[1]!.trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="announcement-detail-drawer"]')

    expect(drawer.attributes('data-show')).toBe('false')
    expect(drawer.attributes('data-detail-id')).toBe('')
  })

  it('closes the detail drawer when the active tab changes', async () => {
    getMyAnnouncementMock
      .mockResolvedValueOnce(detailResponse)
      .mockResolvedValueOnce(bulletinDetailResponse)

    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="my-announcements-list-item"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-show')).toBe(
      'true',
    )

    const bulletinTab = wrapper.findAll('.n-tabs-tab').find((tab) => tab.text() === '公告')

    expect(bulletinTab).toBeDefined()

    await bulletinTab!.trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="announcement-detail-drawer"]')

    expect(drawer.attributes('data-show')).toBe('false')
    expect(drawer.attributes('data-detail-id')).toBe('')
  })

  it('ignores an outdated detail request after the active tab changes', async () => {
    let resolveDetail!: (value: AnnouncementMyDetail) => void

    getMyAnnouncementMock.mockReturnValue(
      new Promise<AnnouncementMyDetail>((resolve) => {
        resolveDetail = resolve
      }),
    )

    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="my-announcements-list-item"]').trigger('click')
    await flushPromises()

    const bulletinTab = wrapper.findAll('.n-tabs-tab').find((tab) => tab.text() === '公告')

    expect(bulletinTab).toBeDefined()

    await bulletinTab!.trigger('click')
    await flushPromises()

    resolveDetail(detailResponse)
    await flushPromises()

    const drawer = wrapper.get('[data-test="announcement-detail-drawer"]')

    expect(drawer.attributes('data-show')).toBe('false')
    expect(drawer.attributes('data-detail-id')).toBe('')
  })
})
