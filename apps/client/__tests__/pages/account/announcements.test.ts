import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_TYPE_BULLETIN,
  ANNOUNCEMENT_TYPE_NOTICE,
  type AnnouncementMyListItem,
  type AnnouncementMyListResponse,
} from '@rev30/contracts'
import { NPagination } from 'naive-ui'
import { defineComponent, h } from 'vue'
import AccountAnnouncementsPage from '../../../src/pages/index/account/announcements.vue'
import { listMyAnnouncements } from '../../../src/features/content'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

vi.mock('../../../src/features/content/MyAnnouncementDetailDrawer.vue', () => ({
  default: defineComponent({
    name: 'MyAnnouncementDetailDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      announcement: {
        type: Object,
        required: true,
      },
    },
    emits: ['update:show'],
    setup(props, { emit }) {
      return () =>
        h('button', {
          'data-test': 'announcement-detail-drawer',
          'data-show': String(props.show),
          'data-announcement-id': props.announcement?.id ?? '',
          onClick: () => emit('update:show', false),
        })
    },
  }),
}))

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  listMyAnnouncements: vi.fn(),
}))

const listMyAnnouncementsMock = vi.mocked(listMyAnnouncements)

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
    listMyAnnouncementsMock.mockResolvedValue(listResponse)
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

  it('keeps separate keywords for each announcement type tab', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.find('[data-test="my-announcements-keyword"] input').setValue('维护通知')
    await wrapper.get('[data-test="my-announcements-search"]').trigger('click')
    await flushPromises()

    const bulletinTab = wrapper.findAll('.n-tabs-tab').find((tab) => tab.text() === '公告')

    expect(bulletinTab).toBeDefined()

    await bulletinTab!.trigger('click')
    await flushPromises()

    const bulletinKeywordInput = wrapper.find('[data-test="my-announcements-keyword"] input')
      .element as HTMLInputElement

    expect(bulletinKeywordInput.value).toBe('')
    expect(listMyAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      type: ANNOUNCEMENT_TYPE_BULLETIN,
    })

    await wrapper.find('[data-test="my-announcements-keyword"] input').setValue('版本')
    await wrapper.get('[data-test="my-announcements-search"]').trigger('click')
    await flushPromises()

    expect(listMyAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      type: ANNOUNCEMENT_TYPE_BULLETIN,
      keyword: '版本',
    })

    const noticeTab = wrapper.findAll('.n-tabs-tab').find((tab) => tab.text() === '通知')

    expect(noticeTab).toBeDefined()

    await noticeTab!.trigger('click')
    await flushPromises()

    const noticeKeywordInput = wrapper.find('[data-test="my-announcements-keyword"] input')
      .element as HTMLInputElement

    expect(noticeKeywordInput.value).toBe('维护通知')
  })

  it('opens the detail drawer with the selected announcement id', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="my-announcements-list-item"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-show')).toBe(
      'true',
    )
    expect(
      wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-announcement-id'),
    ).toBe(noticeItem.id)
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

  it('closes the detail drawer when the drawer closes itself', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.get('[data-test="my-announcements-list-item"]').trigger('click')
    await flushPromises()

    expect(
      wrapper.get('[data-test="announcement-detail-drawer"]').attributes('data-announcement-id'),
    ).toBe(noticeItem.id)

    await wrapper.get('[data-test="announcement-detail-drawer"]').trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="announcement-detail-drawer"]')

    expect(drawer.attributes('data-show')).toBe('false')
    expect(drawer.attributes('data-announcement-id')).toBe(noticeItem.id)
  })

  it('clears the search keyword input', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    await wrapper.find('[data-test="my-announcements-keyword"] input').setValue('维护通知')
    await wrapper.get('[data-test="my-announcements-search"]').trigger('click')
    await flushPromises()

    expect(listMyAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      type: ANNOUNCEMENT_TYPE_NOTICE,
      keyword: '维护通知',
    })

    await wrapper.get('[data-test="my-announcements-reset"]').trigger('click')
    await flushPromises()

    const keywordInput = wrapper.find('[data-test="my-announcements-keyword"] input')
      .element as HTMLInputElement

    expect(keywordInput.value).toBe('')
  })

  it('loads the selected page', async () => {
    const { wrapper } = await mountAnnouncementsPage()
    await flushPromises()

    wrapper.getComponent(NPagination).vm.$emit('update:page', 2)
    await flushPromises()

    expect(listMyAnnouncementsMock).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
      type: ANNOUNCEMENT_TYPE_NOTICE,
    })
  })
})
