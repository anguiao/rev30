import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AuthTokenResponse,
  BuiltinIconListResponse,
  BuiltinIconSetListResponse,
  CustomIconListResponse,
  CustomIconSetListResponse,
} from '@rev30/contracts'
import AdminPage from '../../../src/pages/index.vue'
import {
  exportCustomIconSet,
  listBuiltinIconSets,
  listBuiltinIcons,
  listCustomIconSets,
  listCustomIcons,
} from '../../../src/features/content'
import IconSetsPage from '../../../src/pages/index/content/icon-sets.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'

vi.mock('../../../src/features/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/content')>()),
  listBuiltinIconSets: vi.fn(),
  listBuiltinIcons: vi.fn(),
  listCustomIconSets: vi.fn(),
  listCustomIcons: vi.fn(),
  exportCustomIconSet: vi.fn(),
}))

const listBuiltinIconSetsMock = vi.mocked(listBuiltinIconSets)
const listBuiltinIconsMock = vi.mocked(listBuiltinIcons)
const listCustomIconSetsMock = vi.mocked(listCustomIconSets)
const listCustomIconsMock = vi.mocked(listCustomIcons)
const exportCustomIconSetMock = vi.mocked(exportCustomIconSet)

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
  page: 1,
  pageSize: 20,
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
  total: 1,
  page: 1,
  pageSize: 80,
}

const emptyCustomIconSetsResponse: CustomIconSetListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: 20,
}

const emptyCustomIconsResponse: CustomIconListResponse = {
  list: [],
  total: 0,
  page: 1,
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
  page: 1,
  pageSize: 20,
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
  total: 1,
  page: 1,
  pageSize: 80,
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

describe('icon sets page', () => {
  beforeEach(() => {
    listBuiltinIconSetsMock.mockReset()
    listBuiltinIconsMock.mockReset()
    listCustomIconSetsMock.mockReset()
    listCustomIconsMock.mockReset()
    exportCustomIconSetMock.mockReset()

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

  it('loads built-in icons and opens custom icon set creation', async () => {
    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    expect(wrapper.text()).toContain('图标库')
    expect(wrapper.get('[data-test="builtin-icon-set"]').text()).toContain('Lucide')
    expect(wrapper.get('[data-test="icon-grid-item"]').text()).toContain('sun')
    expect(wrapper.get('[data-test="icon-grid-name"]').text()).toContain('sun')
    expect(listBuiltinIconsMock).toHaveBeenCalledWith({ page: 1, pageSize: 80 })

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()

    expect(listCustomIconSetsMock).toHaveBeenCalled()
    expect(listCustomIconsMock).toHaveBeenCalled()

    await wrapper.get('[data-test="custom-icon-set-create"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('创建图标集')
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

    wrapper.get('button[aria-label="复制图标"]')
    expect(wrapper.find('button[aria-label="重命名图标"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="删除图标"]').exists()).toBe(false)
  })

  it('downloads custom icon set export through authenticated request', async () => {
    listCustomIconSetsMock.mockResolvedValue(customIconSetsResponse)
    listCustomIconsMock.mockResolvedValue(customIconsResponse)
    const createObjectURL = vi.fn(() => 'blob:icon-set')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
    const click = vi.fn()
    const originalCreateElement = document.createElement.bind(document)

    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName)

      if (tagName === 'a') {
        vi.spyOn(element, 'click').mockImplementation(click)
      }

      return element
    })

    const { wrapper } = await mountIconSetsPage()
    await flushPromises()

    await wrapper.get('[data-test="icon-sets-tab-custom"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="custom-icon-set-export"]').trigger('click')
    await flushPromises()

    expect(exportCustomIconSetMock).toHaveBeenCalledWith('acme')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:icon-set')
  })
})
