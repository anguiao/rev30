import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_TYPE_BULLETIN,
  type AnnouncementMyDetail,
  type AnnouncementMyListItem,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import MyAnnouncementDetailDrawer from '../../../src/features/content/MyAnnouncementDetailDrawer.vue'
import { announcementTypeLabels, getMyAnnouncement } from '../../../src/features/content'

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  getMyAnnouncement: vi.fn(),
}))

const getMyAnnouncementMock = vi.mocked(getMyAnnouncement)

const announcementId = '11111111-1111-4111-8111-111111111111'

const announcement: AnnouncementMyListItem = {
  id: announcementId,
  type: ANNOUNCEMENT_TYPE_BULLETIN,
  title: '版本发布公告',
  summary: '本周将上线新版本。',
  pinned: true,
  publishedAt: '2026-05-24T08:30:00.000Z',
}

const detail: AnnouncementMyDetail = {
  ...announcement,
  contentHtml: '<p>第一段内容</p><p><strong>第二段内容</strong></p>',
}

function mountDrawer(props = { show: true, announcement }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(MyAnnouncementDetailDrawer, {
    props,
    attachTo: document.body,
    global: {
      plugins: [pinia, PiniaColada],
      stubs: {
        teleport: true,
      },
    },
  })
}

describe('MyAnnouncementDetailDrawer', () => {
  beforeEach(() => {
    getMyAnnouncementMock.mockReset()
    getMyAnnouncementMock.mockResolvedValue(detail)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('loads and renders the announcement detail content, tags, and html body', async () => {
    mountDrawer()
    await flushPromises()

    const bodyText = document.body.textContent ?? ''

    expect(getMyAnnouncementMock).toHaveBeenCalledWith(announcementId)
    expect(bodyText).toContain(announcementTypeLabels[detail.type])
    expect(bodyText).toContain('置顶')
    expect(bodyText).toContain(detail.title)
    expect(bodyText).toContain(detail.summary ?? '')
    expect(bodyText).toContain(formatDisplayDateTime(detail.publishedAt))
    expect(bodyText).toContain('第一段内容')
    expect(bodyText).toContain('第二段内容')
    expect(
      document.body.querySelector('[data-test="announcement-detail-content"]')?.innerHTML,
    ).toBe(detail.contentHtml)
  })

  it('does not load detail or render the empty state while closed', async () => {
    mountDrawer({ show: false, announcement })
    await flushPromises()

    expect(getMyAnnouncementMock).not.toHaveBeenCalled()
    expect(document.body.textContent ?? '').not.toContain('暂无详情')
  })

  it('renders the drawer header before detail content finishes loading', async () => {
    getMyAnnouncementMock.mockReturnValue(new Promise<AnnouncementMyDetail>(() => {}))

    mountDrawer()
    await flushPromises()

    const bodyText = document.body.textContent ?? ''

    expect(bodyText).toContain(announcementTypeLabels[announcement.type])
    expect(bodyText).toContain(announcement.title)
    expect(document.body.textContent ?? '').not.toContain('暂无详情')
  })

  it('shows a load error when detail loading fails', async () => {
    getMyAnnouncementMock.mockRejectedValueOnce(new Error('load failed'))

    mountDrawer()
    await flushPromises()

    const bodyText = document.body.textContent ?? ''

    expect(bodyText).toContain('load failed')
    expect(bodyText).not.toContain('暂无详情')
  })
})
