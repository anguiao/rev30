import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_NOTICE,
  type Announcement,
} from '@rev30/contracts'
import {
  ContentRequestError,
  createAnnouncement,
  getAnnouncement,
  updateAnnouncement,
} from '../../../src/features/content'
import AnnouncementFormDrawer from '../../../src/features/content/AnnouncementFormDrawer.vue'

vi.mock('../../../src/features/content/RichTextEditor.vue', () => ({
  default: defineComponent({
    name: 'RichTextEditorStub',
    props: {
      modelValue: {
        type: Object,
        required: true,
      },
    },
    emits: ['update:modelValue', 'blur'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            'data-test': 'announcement-form-content-json',
            type: 'button',
            onClick: () =>
              emit('update:modelValue', {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '更新正文' }] }],
              }),
          },
          JSON.stringify(props.modelValue),
        )
    },
  }),
}))

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  createAnnouncement: vi.fn(),
  getAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
}))

const createAnnouncementMock = vi.mocked(createAnnouncement)
const getAnnouncementMock = vi.mocked(getAnnouncement)
const updateAnnouncementMock = vi.mocked(updateAnnouncement)

const announcementId = '11111111-1111-4111-8111-111111111111'
const announcementResponse: Announcement = {
  id: announcementId,
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '维护通知',
  summary: '请关注停机窗口',
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '原始正文' }] }],
  },
  contentText: '原始正文',
  status: ANNOUNCEMENT_STATUS_DRAFT,
  pinned: false,
  publishedAt: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
}

function mountDrawer(props = { show: true, announcementId: null as string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(AnnouncementFormDrawer, {
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

async function fillRequiredFields(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
  await wrapper.get('[data-test="announcement-form-content-json"]').trigger('click')
  await flushPromises()
}

async function clickAction(wrapper: ReturnType<typeof mount>, selector: string) {
  await wrapper.get(selector).trigger('click')
  await flushPromises()
}

function getContentFormItem(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[data-test="announcement-form-content-item"]')
}

describe('AnnouncementFormDrawer', () => {
  beforeEach(() => {
    createAnnouncementMock.mockReset()
    getAnnouncementMock.mockReset()
    updateAnnouncementMock.mockReset()
  })

  it('shows create drawer title', async () => {
    const wrapper = mountDrawer()

    await flushPromises()

    expect(wrapper.text()).toContain('新增通知公告')
    expect(getAnnouncementMock).not.toHaveBeenCalled()
  })

  it('shows edit drawer title and loads announcement detail', async () => {
    getAnnouncementMock.mockResolvedValue(announcementResponse)

    const wrapper = mountDrawer({ show: true, announcementId })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑通知公告')
    expect(getAnnouncementMock).toHaveBeenCalledWith(announcementId)
    expect(
      (wrapper.get('[data-test="announcement-form-title"] input').element as HTMLInputElement)
        .value,
    ).toBe('维护通知')
  })

  it('saves draft without publish true in create mode', async () => {
    createAnnouncementMock.mockResolvedValue(announcementResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '新的维护通知',
      summary: null,
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '更新正文' }] }],
      },
      pinned: false,
      publish: false,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('saves and publishes in create mode', async () => {
    createAnnouncementMock.mockResolvedValue({
      ...announcementResponse,
      status: 'published',
      publishedAt: '2026-05-21T00:00:00.000Z',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-publish"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publish: true,
      }),
    )
  })

  it('saves and publishes in edit mode', async () => {
    getAnnouncementMock.mockResolvedValue(announcementResponse)
    updateAnnouncementMock.mockResolvedValue({
      ...announcementResponse,
      status: 'published',
      publishedAt: '2026-05-21T00:00:00.000Z',
    })

    const wrapper = mountDrawer({ show: true, announcementId })
    await flushPromises()

    await clickAction(wrapper, '[data-test="announcement-form-save-publish"]')

    expect(updateAnnouncementMock).toHaveBeenCalledWith(
      announcementId,
      expect.objectContaining({
        publish: true,
      }),
    )
  })

  it('omits publish false when saving a draft in edit mode', async () => {
    getAnnouncementMock.mockResolvedValue(announcementResponse)
    updateAnnouncementMock.mockResolvedValue(announcementResponse)

    const wrapper = mountDrawer({ show: true, announcementId })
    await flushPromises()

    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(updateAnnouncementMock).toHaveBeenCalledWith(
      announcementId,
      expect.not.objectContaining({
        publish: false,
      }),
    )
  })

  it('shows a plain save action for published announcements', async () => {
    const publishedAnnouncement: Announcement = {
      ...announcementResponse,
      status: ANNOUNCEMENT_STATUS_PUBLISHED,
      publishedAt: '2026-05-21T00:00:00.000Z',
    }
    getAnnouncementMock.mockResolvedValue(publishedAnnouncement)
    updateAnnouncementMock.mockResolvedValue(publishedAnnouncement)

    const wrapper = mountDrawer({ show: true, announcementId })
    await flushPromises()

    expect(wrapper.find('[data-test="announcement-form-save-draft"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="announcement-form-save-publish"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="announcement-form-save"]').text()).toBe('保存')

    await clickAction(wrapper, '[data-test="announcement-form-save"]')

    expect(updateAnnouncementMock).toHaveBeenCalledWith(
      announcementId,
      expect.not.objectContaining({
        publish: true,
      }),
    )
  })

  it('shows server field errors on content form item', async () => {
    createAnnouncementMock.mockRejectedValue(
      new ContentRequestError(400, '请输入正文', 'contentJson'),
    )

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(getContentFormItem(wrapper).text()).toContain('请输入正文')
  })

  it('delegates empty content validation to the server', async () => {
    createAnnouncementMock.mockRejectedValue(
      new ContentRequestError(400, '请输入正文', 'contentJson'),
    )

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      }),
    )
    expect(getContentFormItem(wrapper).text()).toContain('请输入正文')
  })

  it('clears old server field errors when opening a new session', async () => {
    createAnnouncementMock.mockRejectedValue(
      new ContentRequestError(400, '请输入正文', 'contentJson'),
    )

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')
    expect(getContentFormItem(wrapper).text()).toContain('请输入正文')

    await wrapper.setProps({ show: false, announcementId: null })
    await flushPromises()
    await wrapper.setProps({ show: true, announcementId: null })
    await flushPromises()

    expect(getContentFormItem(wrapper).text()).not.toContain('请输入正文')
  })
})
