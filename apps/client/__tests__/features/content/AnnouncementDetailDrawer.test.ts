import { flushPromises, mount } from '@vue/test-utils'
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui'
import { afterEach, describe, expect, it } from 'vitest'
import { ANNOUNCEMENT_TYPE_BULLETIN, type AnnouncementMyDetail } from '@rev30/contracts'
import AnnouncementDetailDrawer from '../../../src/features/content/AnnouncementDetailDrawer.vue'
import { announcementTypeLabels, formatDateTime } from '../../../src/features/content'

const detail: AnnouncementMyDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  type: ANNOUNCEMENT_TYPE_BULLETIN,
  title: '版本发布公告',
  summary: '本周将上线新版本。',
  pinned: true,
  publishedAt: '2026-05-24T08:30:00.000Z',
  contentHtml: '<p>第一段内容</p><p><strong>第二段内容</strong></p>',
}

describe('announcement detail drawer', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the announcement detail content, tags, and html body', async () => {
    mount({
      components: {
        AnnouncementDetailDrawer,
        NConfigProvider,
      },
      template: `
        <NConfigProvider :date-locale="dateZhCN" :locale="zhCN">
          <AnnouncementDetailDrawer v-model:show="show" :detail="detail" />
        </NConfigProvider>
      `,
      data() {
        return {
          detail,
          show: true,
          dateZhCN,
          zhCN,
        }
      },
      attachTo: document.body,
    })
    await flushPromises()

    const bodyText = document.body.textContent ?? ''

    expect(bodyText).toContain('通知公告')
    expect(bodyText).toContain(announcementTypeLabels[detail.type])
    expect(bodyText).toContain('置顶')
    expect(bodyText).toContain(detail.title)
    expect(bodyText).toContain(detail.summary ?? '')
    expect(bodyText).toContain(formatDateTime(detail.publishedAt))
    expect(bodyText).toContain('第一段内容')
    expect(bodyText).toContain('第二段内容')
    expect(
      document.body.querySelector('[data-test="announcement-detail-content"]')?.innerHTML,
    ).toBe(detail.contentHtml)
  })
})
