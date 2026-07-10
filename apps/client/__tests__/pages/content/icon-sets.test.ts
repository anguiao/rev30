import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AuthTokenResponse,
  BuiltinIconListResponse,
  BuiltinIconSetListResponse,
  CustomIconListResponse,
  CustomIconSetListResponse,
} from '@rev30/contracts'
import AdminPage from '../../../src/pages/index.vue'
import {
  deleteCustomIconSet,
  exportCustomIconSet,
  listBuiltinIconSets,
  listBuiltinIcons,
  listCustomIconSets,
  listCustomIcons,
  renameCustomIcon,
} from '../../../src/features/content'
import IconSetsPage from '../../../src/pages/index/content/icon-sets.vue'
import { saveFile } from '../../../src/utils/download'
import { mountAuthRoute, session, stubPreferredDark } from '../../helpers/auth'

vi.mock('../../../src/features/content/IconSetFormDrawer.vue', () => ({
  default: {
    name: 'IconSetFormDrawerStub',
    props: ['show', 'prefix'],
    emits: ['update:show', 'saved'],
    template: `
      <div
        data-test="icon-set-form-drawer"
        :data-show="show"
        :data-prefix="prefix ?? ''"
      >
        {{ show ? (prefix === null ? '创建图标集' : '编辑图标集') : '' }}
      </div>
    `,
  },
}))

vi.mock('../../../src/features/content/IconUploadDrawer.vue', () => ({
  default: {
    name: 'IconUploadDrawerStub',
    props: ['show', 'prefix'],
    emits: ['update:show', 'uploaded'],
    template: `
      <div data-test="icon-upload-drawer" :data-show="show" :data-prefix="prefix ?? ''">
        {{ show ? '上传 SVG 图标' : '' }}
      </div>
    `,
  },
}))

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  deleteCustomIconSet: vi.fn(),
  listBuiltinIconSets: vi.fn(),
  listBuiltinIcons: vi.fn(),
  listCustomIconSets: vi.fn(),
  listCustomIcons: vi.fn(),
  exportCustomIconSet: vi.fn(),
  renameCustomIcon: vi.fn(),
}))

vi.mock('../../../src/utils/download', () => ({
  saveFile: vi.fn(),
}))

const listBuiltinIconSetsMock = vi.mocked(listBuiltinIconSets)
const listBuiltinIconsMock = vi.mocked(listBuiltinIcons)
const listCustomIconSetsMock = vi.mocked(listCustomIconSets)
const listCustomIconsMock = vi.mocked(listCustomIcons)
const deleteCustomIconSetMock = vi.mocked(deleteCustomIconSet)
const exportCustomIconSetMock = vi.mocked(exportCustomIconSet)
const renameCustomIconMock = vi.mocked(renameCustomIcon)
const saveFileMock = vi.mocked(saveFile)

const authSession: AuthTokenResponse = {
  ...session,
  accessCodes: [
    'content:icon-set:list',
    'content:icon-set:create',
    'content:icon-set:update',
    'content:icon-set:delete',
    'content:icon-set:export',
  ],
}

const builtinIconSetsResponse: BuiltinIconSetListResponse = {
  list: [
    {
      prefix: 'lucide',
      name: 'Lucide',
      total: 1,
    },
  ],
  total: 1,
}

const builtinIconsResponse: BuiltinIconListResponse = {
  list: [
    {
      icon: 'lucide:sun',
      prefix: 'lucide',
      name: 'sun',
      setName: 'Lucide',
      body: '<path d="M12 4V2" />',
      width: 24,
      height: 24,
    },
  ],
  nextCursor: null,
  pageSize: 80,
}

const emptyCustomIconSetsResponse: CustomIconSetListResponse = {
  list: [],
  total: 0,
}

const emptyCustomIconsResponse: CustomIconListResponse = {
  list: [],
  nextCursor: null,
  pageSize: 80,
}

const customIconSetsResponse: CustomIconSetListResponse = {
  list: [
    {
      prefix: 'acme',
      name: 'Acme Icons',
      description: null,
      iconCount: 1,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    },
  ],
  total: 1,
}

const customIconsResponse: CustomIconListResponse = {
  list: [
    {
      icon: 'acme:logo',
      prefix: 'acme',
      name: 'logo',
      setName: 'Acme Icons',
      body: '<path d="M0 0h24v24H0z" />',
      width: 24,
      height: 24,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    },
  ],
  nextCursor: null,
  pageSize: 80,
}

function setElementScrollMetrics(
  element: Element,
  metrics: {
    scrollTop: number
    clientHeight: number
    scrollHeight: number
  },
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {
      configurable: true,
      value,
    })
  }
}

async function mountIconSetsPage(nextSession: AuthTokenResponse = authSession) {
  return mountAuthRoute(
    '/content/icon-sets',
    [
      {
        path: '/',
        component: AdminPage,
        children: [{ path: 'content/icon-sets', component: IconSetsPage }],
      },
    ],
    nextSession,
  )
}

function getBodyButton(label: string) {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )

  expect(button).toBeDefined()
  return button!
}

describe('icon sets page', () => {
  beforeEach(() => {
    deleteCustomIconSetMock.mockReset()
    listBuiltinIconSetsMock.mockReset()
    listBuiltinIconsMock.mockReset()
    listCustomIconSetsMock.mockReset()
    listCustomIconsMock.mockReset()
    exportCustomIconSetMock.mockReset()
    renameCustomIconMock.mockReset()
    saveFileMock.mockReset()

    listBuiltinIconSetsMock.mockResolvedValue(builtinIconSetsResponse)
    listBuiltinIconsMock.mockResolvedValue(builtinIconsResponse)
    listCustomIconSetsMock.mockResolvedValue(emptyCustomIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(emptyCustomIconsResponse)
    exportCustomIconSetMock.mockResolvedValue({
      blob: new Blob(['{}'], { type: 'application/json' }),
      filename: 'acme.json',
    })

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
    stubPreferredDark(false)
  })

  it('loads built-in icons and opens custom icon set creation', async () => {
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    expect(wrapper.text()).toContain('图标库')
    expect(wrapper.get('[data-test="builtin-icon-set"]').text()).toContain('Lucide')
    expect(wrapper.get('[data-test="icon-grid-item"]').text()).toContain('sun')
    expect(wrapper.get('[data-test="icon-grid-name"]').text()).toContain('sun')
    expect(listBuiltinIconsMock).toHaveBeenCalledWith({ cursor: undefined, pageSize: 80 })

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()

    expect(listCustomIconSetsMock).toHaveBeenCalled()
    expect(listCustomIconsMock).toHaveBeenCalled()

    const createButton = wrapper.get('[data-test="custom-icon-set-create"]')
    await createButton.trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="icon-set-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-prefix')).toBe('')
    expect(drawer.text()).toBe('创建图标集')
  })

  it('opens edit and upload drawers with the selected custom icon set prefix', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="编辑图标集"]').trigger('click')
    await flushPromises()

    const formDrawer = wrapper.get('[data-test="icon-set-form-drawer"]')
    expect(formDrawer.attributes('data-show')).toBe('true')
    expect(formDrawer.attributes('data-prefix')).toBe('acme')
    expect(formDrawer.text()).toBe('编辑图标集')

    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set-upload"]').trigger('click')
    await flushPromises()

    const uploadDrawer = wrapper.get('[data-test="icon-upload-drawer"]')
    expect(uploadDrawer.attributes('data-show')).toBe('true')
    expect(uploadDrawer.attributes('data-prefix')).toBe('acme')
    expect(uploadDrawer.text()).toBe('上传 SVG 图标')
  })

  it('loads the next built-in icon page when the icon grid scrolls near the bottom', async () => {
    listBuiltinIconsMock
      .mockResolvedValueOnce({
        ...builtinIconsResponse,
        nextCursor: 'lucide:sun',
      })
      .mockResolvedValueOnce({
        ...builtinIconsResponse,
        list: [
          {
            icon: 'lucide:moon',
            prefix: 'lucide',
            name: 'moon',
            setName: 'Lucide',
            body: '<path d="M12 3a9 9 0 1 0 9 9" />',
            width: 24,
            height: 24,
          },
        ],
        nextCursor: null,
      })

    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    const scrollPanel = wrapper.get('[data-test="builtin-icon-scroll"] .n-scrollbar-container')
    setElementScrollMetrics(scrollPanel.element, {
      scrollTop: 900,
      clientHeight: 300,
      scrollHeight: 1100,
    })

    await scrollPanel.trigger('scroll')
    await flushPromises()

    expect(listBuiltinIconsMock).toHaveBeenLastCalledWith({
      cursor: 'lucide:sun',
      pageSize: 80,
    })
    expect(wrapper.get('[data-test="icon-grid-item"]').text()).toContain('sun')
    expect(wrapper.text()).toContain('moon')
  })

  it('hides custom icon rename and delete actions without update or delete permission', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    const { wrapper } = await mountIconSetsPage({
      ...authSession,
      accessCodes: ['content:icon-set:list', 'content:icon-set:create'],
    })
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()

    wrapper.get('button[aria-label="复制图标名称"]')
    wrapper.get('button[aria-label="复制 SVG"]')
    expect(wrapper.find('button[aria-label="重命名图标"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="删除图标"]').exists()).toBe(false)
  })

  it('renames a custom icon and renders the refreshed icon list', async () => {
    const renamedIcon = {
      ...customIconsResponse.list[0]!,
      icon: 'acme:mark',
      name: 'mark',
    }
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock
      .mockResolvedValueOnce(customIconsResponse)
      .mockResolvedValue({ ...customIconsResponse, list: [renamedIcon] })
    renameCustomIconMock.mockResolvedValue(renamedIcon)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="重命名图标"]').trigger('click')
    await flushPromises()

    const input = document.body.querySelector(
      'input[placeholder="请输入图标名称"]',
    ) as HTMLInputElement | null
    expect(input).not.toBeNull()
    input!.value = '  mark  '
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    getBodyButton('保存').click()
    await flushPromises()

    expect(renameCustomIconMock).toHaveBeenCalledWith('acme', 'logo', { name: 'mark' })
    expect(document.body.textContent).toContain('重命名图标成功')
    expect(wrapper.text()).toContain('mark')
  })

  it('keeps icon set deletion available after failure and refreshes after success', async () => {
    listCustomIconSetsMock
      .mockResolvedValueOnce(customIconSetsResponse)
      .mockResolvedValue(emptyCustomIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    deleteCustomIconSetMock
      .mockRejectedValueOnce(new Error('删除请求失败'))
      .mockResolvedValueOnce(undefined)
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="删除图标集"]').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('确定删除自定义图标集“Acme Icons”吗？')
    getBodyButton('删除').click()
    await flushPromises()

    expect(deleteCustomIconSetMock).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('删除请求失败')
    expect(
      document.body.querySelector('[data-test="custom-icon-set-delete-confirm"]'),
    ).not.toBeNull()

    getBodyButton('删除').click()
    await flushPromises()

    expect(deleteCustomIconSetMock).toHaveBeenCalledTimes(2)
    expect(deleteCustomIconSetMock).toHaveBeenLastCalledWith('acme')
    expect(document.body.textContent).toContain('删除图标集成功')
    expect(wrapper.find('[data-test="custom-icon-set"]').exists()).toBe(false)
    expect(listCustomIconSetsMock).toHaveBeenCalledTimes(2)
  })

  it('downloads custom icon set export through authenticated request', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)

    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set-export"]').trigger('click')
    await flushPromises()

    expect(exportCustomIconSetMock).toHaveBeenCalledWith('acme')
    expect(saveFileMock).toHaveBeenCalledWith(expect.any(Blob), 'acme.json')
  })
})
