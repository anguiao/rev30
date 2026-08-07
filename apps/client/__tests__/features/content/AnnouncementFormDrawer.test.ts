import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getErrorMessage } from '../../../src/utils/error'
import { ApiRequestError } from '../../../src/utils/request'
import {
  ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_NOTICE,
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
  type Announcement,
  type AnnouncementTargetOptionsResponse,
  type DepartmentTreeOptionsResponse,
  type RoleOptionsResponse,
  type TiptapDocument,
  type UserOptionsResponse,
} from '@rev30/contracts'
import { compressImageFile, uploadAttachment } from '../../../src/features/attachments'
import {
  createAnnouncement,
  getAnnouncement,
  getAnnouncementTargetOptions,
  updateAnnouncement,
} from '../../../src/features/content'
import AnnouncementFormDrawer from '../../../src/features/content/AnnouncementFormDrawer.vue'
import { createTestQueryHarness } from '../../helpers/colada'

const { createStandardRichTextEditorPresetMock } = vi.hoisted(() => ({
  createStandardRichTextEditorPresetMock: vi.fn((options: { image: unknown }) => ({
    image: options.image,
  })),
}))

vi.mock('@rev30/rich-text/vue/presets/standard', () => ({
  createStandardRichTextEditorPreset: createStandardRichTextEditorPresetMock,
}))

type RichTextImageOptions = {
  upload: (file: File) => Promise<{ src: string }>
  onError?: (error: unknown) => void
}

type RichTextEditorStubPreset = {
  image?: RichTextImageOptions
}

vi.mock('@rev30/rich-text/vue', () => ({
  RichTextEditor: defineComponent({
    name: 'RichTextEditorStub',
    props: {
      modelValue: {
        type: Object,
        required: true,
      },
      disabled: {
        type: Boolean,
        required: false,
      },
      preset: {
        type: Object,
        required: true,
      },
      toolbar: {
        type: Object,
        required: false,
      },
    },
    emits: ['update:modelValue', 'blur'],
    setup(props, { emit }) {
      async function insertImage() {
        const image = (props.preset as RichTextEditorStubPreset).image

        if (!image) {
          return
        }

        try {
          const { src } = await image.upload(
            new File(['image'], 'announcement.png', { type: 'image/png' }),
          )
          const content =
            (
              props.modelValue as TiptapDocument & {
                content?: unknown[]
              }
            ).content ?? []

          emit('update:modelValue', {
            type: 'doc',
            content: [...content, { type: 'image', attrs: { src } }],
          })
        } catch (error) {
          image.onError?.(error)
        }
      }

      function reportImageLoadError() {
        const image = (props.preset as RichTextEditorStubPreset).image

        image?.onError?.(new Error('image load failed'))
      }

      return () => [
        h(
          'button',
          {
            'data-test': 'announcement-form-rich-text-stub',
            type: 'button',
            onClick: () =>
              emit('update:modelValue', {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '更新正文' }] }],
              }),
            onBlur: () => emit('blur'),
          },
          'editor',
        ),
        h(
          'button',
          {
            'data-test': 'announcement-form-rich-text-standard-format',
            type: 'button',
            onClick: () =>
              emit('update:modelValue', {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: '带下划线的正文',
                        marks: [{ type: 'underline' }],
                      },
                    ],
                  },
                ],
              }),
          },
          'standard format',
        ),
        h(
          'button',
          {
            'data-test': 'announcement-form-rich-text-insert-image',
            type: 'button',
            onClick: () => void insertImage(),
          },
          'insert image',
        ),
        h(
          'button',
          {
            'data-test': 'announcement-form-rich-text-image-load-error',
            type: 'button',
            onClick: reportImageLoadError,
          },
          'image load error',
        ),
      ]
    },
  }),
}))

vi.mock('../../../src/features/attachments/imageCompression', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/attachments/imageCompression')>()),
  compressImageFile: vi.fn((file: File) => file),
}))

vi.mock('../../../src/features/attachments/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/attachments/requests')>()),
  uploadAttachment: vi.fn(),
}))

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  createAnnouncement: vi.fn(),
  getAnnouncement: vi.fn(),
  getAnnouncementTargetOptions: vi.fn(),
  updateAnnouncement: vi.fn(),
}))

vi.mock('../../../src/utils/error', () => ({
  getErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}))

const createAnnouncementMock = vi.mocked(createAnnouncement)
const compressImageFileMock = vi.mocked(compressImageFile)
const getAnnouncementMock = vi.mocked(getAnnouncement)
const getAnnouncementTargetOptionsMock = vi.mocked(getAnnouncementTargetOptions)
const getErrorMessageMock = vi.mocked(getErrorMessage)
const updateAnnouncementMock = vi.mocked(updateAnnouncement)
const uploadAttachmentMock = vi.mocked(uploadAttachment)

const announcementId = '11111111-1111-4111-8111-111111111111'
const userTargetId = '22222222-2222-4222-8222-222222222222'
const departmentTargetId = '33333333-3333-4333-8333-333333333333'
const roleTargetId = '44444444-4444-4444-8444-444444444444'

const userOptionsResponse: UserOptionsResponse = [
  {
    id: userTargetId,
    username: 'ada',
    nickname: 'Ada',
    status: USER_STATUS_ENABLED,
  },
]

const departmentOptionsResponse: DepartmentTreeOptionsResponse = [
  {
    id: departmentTargetId,
    parentId: null,
    name: '研发部',
    code: 'rd',
    status: DEPARTMENT_STATUS_ENABLED,
    children: [],
  },
]

const roleOptionsResponse: RoleOptionsResponse = [
  {
    id: roleTargetId,
    name: '管理员',
    code: 'admin',
    status: ROLE_STATUS_ENABLED,
  },
]

const targetOptionsResponse: AnnouncementTargetOptionsResponse = {
  users: userOptionsResponse,
  departments: departmentOptionsResponse,
  roles: roleOptionsResponse,
}

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
  contentHtml: '<p>原始正文</p>',
  visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
  targets: [
    {
      targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
      targetId: userTargetId,
    },
    {
      targetType: ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
      targetId: departmentTargetId,
    },
    {
      targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
      targetId: roleTargetId,
    },
  ],
  status: ANNOUNCEMENT_STATUS_DRAFT,
  pinned: false,
  publishedAt: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
}

const legacyCompactContentJson: TiptapDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '旧版标题', marks: [{ type: 'bold' }] }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '旧版链接',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://example.com/legacy',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
              },
            },
          ],
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '旧版列表项' }],
            },
          ],
        },
      ],
    },
  ],
}

const queryCaches = new WeakMap<
  object,
  ReturnType<ReturnType<typeof createTestQueryHarness>['getQueryCache']>
>()

function mountDrawer(props = { show: true, announcementId: null as string | null }) {
  const queryHarness = createTestQueryHarness()

  const wrapper = mount(AnnouncementFormDrawer, {
    props,
    attachTo: document.body,
    global: {
      plugins: queryHarness.plugins,
      stubs: {
        teleport: true,
      },
    },
  })

  queryCaches.set(wrapper, queryHarness.getQueryCache())

  return wrapper
}

function getQueryCache(wrapper: ReturnType<typeof mount>) {
  const queryCache = queryCaches.get(wrapper)

  if (!queryCache) {
    throw new Error('Expected a query cache for the mounted announcement form drawer')
  }

  return queryCache
}

async function refetchAnnouncementForm(
  wrapper: ReturnType<typeof mount>,
  currentAnnouncementId: string | null,
) {
  await getQueryCache(wrapper).invalidateQueries({
    key: ['content', 'announcement-form', currentAnnouncementId ?? 'create'],
    exact: true,
  })
  await flushPromises()
}

async function fillRequiredFields(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
  await wrapper.get('[data-test="announcement-form-rich-text-stub"]').trigger('click')
  await flushPromises()
}

async function selectUserTarget(wrapper: ReturnType<typeof mount>) {
  getTestComponent(wrapper, 'announcement-form-target-users').vm.$emit('update:value', [
    userTargetId,
  ])
  await flushPromises()
}

async function clickAction(wrapper: ReturnType<typeof mount>, selector: string) {
  await wrapper.get(selector).trigger('click')
  await flushPromises()
}

function getContentFormItem(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[data-test="announcement-form-content-item"]')
}

function getTargetsFormItem(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[data-test="announcement-form-targets-item"]')
}

type TestComponentWrapper = {
  vm: {
    $emit: (event: string, ...args: unknown[]) => void
  }
  props: (name: string) => unknown
}

function getTestComponent(wrapper: ReturnType<typeof mount>, dataTest: string) {
  return wrapper.getComponent(`[data-test="${dataTest}"]`) as unknown as TestComponentWrapper
}

describe('AnnouncementFormDrawer', () => {
  beforeEach(() => {
    createAnnouncementMock.mockReset()
    compressImageFileMock.mockReset()
    compressImageFileMock.mockImplementation(async (file) => file)
    getAnnouncementMock.mockReset()
    getAnnouncementTargetOptionsMock.mockReset()
    getErrorMessageMock.mockClear()
    updateAnnouncementMock.mockReset()
    uploadAttachmentMock.mockReset()
    uploadAttachmentMock.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
    })
    getAnnouncementTargetOptionsMock.mockResolvedValue(targetOptionsResponse)
  })

  it('defaults create mode to targeted visibility with empty selected objects', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('新增通知公告')
    expect(getAnnouncementMock).not.toHaveBeenCalled()
    expect(getAnnouncementTargetOptionsMock).toHaveBeenCalledWith()
    expect(getTestComponent(wrapper, 'announcement-form-visibility').props('value')).toBe(
      ANNOUNCEMENT_VISIBILITY_TARGETED,
    )
    expect(getTestComponent(wrapper, 'announcement-form-target-users').props('value')).toEqual([])
    expect(
      getTestComponent(wrapper, 'announcement-form-target-departments').props('value'),
    ).toEqual([])
    expect(getTestComponent(wrapper, 'announcement-form-target-roles').props('value')).toEqual([])
  })

  it('submits all visibility with empty targets', async () => {
    createAnnouncementMock.mockResolvedValue({
      ...announcementResponse,
      visibility: ANNOUNCEMENT_VISIBILITY_ALL,
      targets: [],
    })

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    getTestComponent(wrapper, 'announcement-form-visibility').vm.$emit(
      'update:value',
      ANNOUNCEMENT_VISIBILITY_ALL,
    )
    await flushPromises()
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: ANNOUNCEMENT_VISIBILITY_ALL,
        targets: [],
      }),
    )
  })

  it('saves draft without publish true in create mode', async () => {
    createAnnouncementMock.mockResolvedValue(announcementResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    getTestComponent(wrapper, 'announcement-form-target-users').vm.$emit('update:value', [
      userTargetId,
    ])
    getTestComponent(wrapper, 'announcement-form-target-departments').vm.$emit('update:value', [
      departmentTargetId,
    ])
    getTestComponent(wrapper, 'announcement-form-target-roles').vm.$emit('update:value', [
      roleTargetId,
    ])
    await flushPromises()
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '新的维护通知',
      summary: null,
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '更新正文' }] }],
      },
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
          targetId: userTargetId,
        },
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
          targetId: departmentTargetId,
        },
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_ROLE,
          targetId: roleTargetId,
        },
      ],
      pinned: false,
      publish: false,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('keeps create draft values when the form query refreshes', async () => {
    createAnnouncementMock.mockResolvedValue(announcementResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await selectUserTarget(wrapper)
    await refetchAnnouncementForm(wrapper, null)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith({
      type: ANNOUNCEMENT_TYPE_NOTICE,
      title: '新的维护通知',
      summary: null,
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '更新正文' }] }],
      },
      visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
      targets: [
        {
          targetType: ANNOUNCEMENT_TARGET_TYPE_USER,
          targetId: userTargetId,
        },
      ],
      pinned: false,
      publish: false,
    })
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
    await selectUserTarget(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-publish"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publish: true,
      }),
    )
  })

  it('loads edit values and saves and publishes in edit mode', async () => {
    getAnnouncementMock.mockResolvedValue(announcementResponse)
    updateAnnouncementMock.mockResolvedValue({
      ...announcementResponse,
      status: 'published',
      publishedAt: '2026-05-21T00:00:00.000Z',
    })

    const wrapper = mountDrawer({ show: true, announcementId })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑通知公告')
    expect(getAnnouncementMock).toHaveBeenCalledWith(announcementId)
    expect(getAnnouncementTargetOptionsMock).toHaveBeenCalledWith(announcementId)
    expect(getTestComponent(wrapper, 'announcement-form-visibility').props('value')).toBe(
      ANNOUNCEMENT_VISIBILITY_TARGETED,
    )
    expect(getTestComponent(wrapper, 'announcement-form-target-users').props('value')).toEqual([
      userTargetId,
    ])
    expect(
      getTestComponent(wrapper, 'announcement-form-target-departments').props('value'),
    ).toEqual([departmentTargetId])
    expect(getTestComponent(wrapper, 'announcement-form-target-roles').props('value')).toEqual([
      roleTargetId,
    ])
    expect(
      (wrapper.get('[data-test="announcement-form-title"] input').element as HTMLInputElement)
        .value,
    ).toBe('维护通知')

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

  it('clears targets validation feedback when visible object changes in the same session', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')
    expect(getTargetsFormItem(wrapper).text()).toContain('请选择可见对象')
    expect(createAnnouncementMock).not.toHaveBeenCalled()

    await selectUserTarget(wrapper)

    expect(getTargetsFormItem(wrapper).text()).not.toContain('请选择可见对象')
  })

  it('submits valid empty content', async () => {
    createAnnouncementMock.mockResolvedValue({
      ...announcementResponse,
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
      contentText: '',
      contentHtml: '<p></p>',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
    await selectUserTarget(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      }),
    )
  })

  it('uploads announcement images as internal attachments and submits their URL', async () => {
    const compressedFile = new File(['compressed'], 'announcement.webp', {
      type: 'image/webp',
    })
    const attachmentId = '55555555-5555-4555-8555-555555555555'
    createAnnouncementMock.mockResolvedValue(announcementResponse)
    compressImageFileMock.mockResolvedValue(compressedFile)
    uploadAttachmentMock.mockResolvedValue({ id: attachmentId })

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
    await selectUserTarget(wrapper)
    await wrapper.get('[data-test="announcement-form-rich-text-insert-image"]').trigger('click')
    await flushPromises()

    const sourceFile = compressImageFileMock.mock.calls[0]?.[0]

    expect(sourceFile).toBeInstanceOf(File)
    expect(compressImageFileMock).toHaveBeenCalledWith(sourceFile, {
      maxDimension: 1920,
      quality: 0.86,
    })
    expect(uploadAttachmentMock).toHaveBeenCalledWith(compressedFile, {
      usage: 'announcement-content-image',
      readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
      cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
    })

    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: {
          type: 'doc',
          content: [
            { type: 'paragraph' },
            {
              type: 'image',
              attrs: {
                src: `/api/attachments/${attachmentId}/content`,
              },
            },
          ],
        },
      }),
    )
  })

  it('shows a fixed image error without adding failed images to submitted content', async () => {
    createAnnouncementMock.mockResolvedValue(announcementResponse)
    uploadAttachmentMock.mockRejectedValue(new Error('upload failed'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
    await selectUserTarget(wrapper)
    await wrapper.get('[data-test="announcement-form-rich-text-insert-image"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('上传图片失败')

    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      }),
    )
  })

  it('shows the same fixed error without submitting an image when it cannot load', async () => {
    createAnnouncementMock.mockResolvedValue(announcementResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
    await selectUserTarget(wrapper)
    await wrapper.get('[data-test="announcement-form-rich-text-image-load-error"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('上传图片失败')

    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        },
      }),
    )
  })

  it('submits standard rich text formatting', async () => {
    createAnnouncementMock.mockResolvedValue(announcementResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="announcement-form-title"] input').setValue('新的维护通知')
    await selectUserTarget(wrapper)
    await wrapper.get('[data-test="announcement-form-rich-text-standard-format"]').trigger('click')
    await flushPromises()
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(createAnnouncementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '带下划线的正文',
                  marks: [{ type: 'underline' }],
                },
              ],
            },
          ],
        },
      }),
    )
  })

  it('loads and resubmits a frozen compact announcement body in edit mode', async () => {
    const legacyAnnouncement: Announcement = {
      ...announcementResponse,
      contentJson: legacyCompactContentJson,
    }
    getAnnouncementMock.mockResolvedValue(legacyAnnouncement)
    updateAnnouncementMock.mockResolvedValue(legacyAnnouncement)

    const wrapper = mountDrawer({ show: true, announcementId })
    await flushPromises()

    expect(wrapper.getComponent({ name: 'RichTextEditorStub' }).props('modelValue')).toEqual(
      legacyCompactContentJson,
    )

    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')

    expect(updateAnnouncementMock).toHaveBeenCalledWith(
      announcementId,
      expect.objectContaining({
        contentJson: legacyCompactContentJson,
      }),
    )
  })

  it('clears content server field errors when content changes in the same session', async () => {
    createAnnouncementMock.mockRejectedValue(new ApiRequestError(400, '请输入正文', 'contentJson'))

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await selectUserTarget(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')
    expect(getContentFormItem(wrapper).text()).toContain('请输入正文')

    await wrapper.get('[data-test="announcement-form-rich-text-stub"]').trigger('click')
    await flushPromises()

    expect(getContentFormItem(wrapper).text()).not.toContain('请输入正文')
  })

  it('clears old server field errors when opening a new session', async () => {
    createAnnouncementMock.mockRejectedValue(new ApiRequestError(400, '请输入正文', 'contentJson'))

    const wrapper = mountDrawer()
    await flushPromises()

    await fillRequiredFields(wrapper)
    await selectUserTarget(wrapper)
    await clickAction(wrapper, '[data-test="announcement-form-save-draft"]')
    expect(getContentFormItem(wrapper).text()).toContain('请输入正文')

    await wrapper.setProps({ show: false, announcementId: null })
    await flushPromises()
    await wrapper.setProps({ show: true, announcementId: null })
    await flushPromises()

    expect(getContentFormItem(wrapper).text()).not.toContain('请输入正文')
  })
})
