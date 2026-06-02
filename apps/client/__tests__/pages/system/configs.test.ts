import { useQueryCache } from '@pinia/colada'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NDataTable, NPagination, NSelect } from 'naive-ui'
import {
  CONFIG_STATUS_DISABLED,
  CONFIG_STATUS_ENABLED,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  CONFIG_VALUE_TYPE_STRING,
  type ConfigListItem,
  type ConfigListResponse,
} from '@rev30/contracts'
import { defineComponent, h } from 'vue'
import {
  deleteConfig,
  formatDateTime,
  listConfigs,
  SystemRequestError,
} from '../../../src/features/system'
import ConfigsPage from '../../../src/pages/index/system/configs.vue'
import {
  disposeActiveTestPinia,
  mountAuthRoute,
  session,
  stubPreferredDark,
} from '../../helpers/auth'
vi.mock('../../../src/features/system/ConfigFormDrawer.vue', () => ({
  default: defineComponent({
    name: 'ConfigFormDrawerStub',
    props: {
      show: {
        type: Boolean,
        required: true,
      },
      configId: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-config-id': props.configId ?? '',
          'data-show': String(props.show),
          'data-test': 'config-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  deleteConfig: vi.fn(),
  listConfigs: vi.fn(),
}))

const deleteConfigMock = vi.mocked(deleteConfig)
const listConfigsMock = vi.mocked(listConfigs)

const baseConfig: ConfigListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  groupCode: 'site',
  key: 'site.title',
  name: '站点名称',
  valueType: CONFIG_VALUE_TYPE_STRING,
  value: 'Rev30',
  description: '站点标题',
  status: CONFIG_STATUS_ENABLED,
  createdAt: '2026-05-18T01:02:03.000Z',
  updatedAt: '2026-05-18T01:02:03.000Z',
}

const configsResponse: ConfigListResponse = {
  list: [
    baseConfig,
    {
      ...baseConfig,
      id: '22222222-2222-4111-8111-111111111112',
      groupCode: 'feature',
      key: 'feature.flags',
      name: '功能开关',
      valueType: CONFIG_VALUE_TYPE_JSON,
      value: '{"newDashboard":true}',
      status: CONFIG_STATUS_DISABLED,
      updatedAt: '2026-05-19T01:02:03.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

async function mountConfigsPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute('/system/configs', [{ path: '/system/configs', component: ConfigsPage }], {
    ...session,
    accessCodes,
  })
}

describe('configs page', () => {
  beforeEach(() => {
    deleteConfigMock.mockReset()
    listConfigsMock.mockReset()
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

  it('loads and renders configs with pagination', async () => {
    listConfigsMock.mockResolvedValue(configsResponse)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    expect(listConfigsMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    expect(wrapper.text()).toContain('系统配置')
    expect(wrapper.text()).toContain('共 2 个')
    expect(wrapper.text()).toContain(baseConfig.key)
    expect(wrapper.text()).toContain('字符串')
    expect(wrapper.text()).toContain(baseConfig.value)
    expect(wrapper.text()).toContain(formatDateTime(baseConfig.updatedAt))
    expect(wrapper.getComponent(NDataTable).props('pagination')).toBe(false)
    expect(wrapper.findComponent(NPagination).exists()).toBe(true)
  })

  it('renders long config values with ellipsis tooltip', async () => {
    listConfigsMock.mockResolvedValue(configsResponse)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    const columns = wrapper.getComponent(NDataTable).props('columns') as Array<{
      key?: string
      ellipsis?: unknown
      render?: (row: ConfigListItem) => unknown
    }>
    const valueColumn = columns.find((column) => column.key === 'value')

    expect(valueColumn?.render).toBeTypeOf('function')
    expect(valueColumn?.ellipsis).toMatchObject({ tooltip: true })
    expect(valueColumn!.render!(baseConfig)).toBe(baseConfig.value)
  })

  it('searches and resets filters without issuing duplicate requests', async () => {
    listConfigsMock.mockResolvedValue(configsResponse)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    await wrapper.find('[data-test="configs-keyword"] input').setValue('  site  ')
    await wrapper.find('[data-test="configs-group-code"] input').setValue('  base  ')

    wrapper
      .get('[data-test="configs-value-type"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', CONFIG_VALUE_TYPE_NUMBER)
    wrapper
      .get('[data-test="configs-status"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', CONFIG_STATUS_DISABLED)
    await flushPromises()
    await wrapper.get('[data-test="configs-search"]').trigger('click')
    await flushPromises()
    const callCountAfterSearch = listConfigsMock.mock.calls.length

    expect(listConfigsMock).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      keyword: 'site',
      groupCode: 'base',
      valueType: CONFIG_VALUE_TYPE_NUMBER,
      status: CONFIG_STATUS_DISABLED,
    })

    const queryCache = useQueryCache()
    const initialQueryEntry = queryCache.get([
      'system',
      'configs',
      'list',
      1,
      20,
      '',
      '',
      null,
      null,
    ])
    if (initialQueryEntry !== undefined) {
      queryCache.remove(initialQueryEntry)
    }

    await wrapper.get('[data-test="configs-reset"]').trigger('click')
    await flushPromises()
    await vi.waitFor(() => {
      expect(listConfigsMock.mock.calls.length).toBe(callCountAfterSearch + 1)
    })
    expect(listConfigsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })

    expect(
      (wrapper.get('[data-test="configs-keyword"] input').element as HTMLInputElement).value,
    ).toBe('')
    expect(
      (wrapper.get('[data-test="configs-group-code"] input').element as HTMLInputElement).value,
    ).toBe('')
    expect(
      wrapper.get('[data-test="configs-value-type"]').getComponent(NSelect).props('value'),
    ).toBe('all')
    expect(wrapper.get('[data-test="configs-status"]').getComponent(NSelect).props('value')).toBe(
      'all',
    )

    const callCountAfterFirstReset = listConfigsMock.mock.calls.length
    await wrapper.get('[data-test="configs-reset"]').trigger('click')
    await flushPromises()

    expect(listConfigsMock.mock.calls.length).toBe(callCountAfterFirstReset)
  })

  it('shows a server load error when configs cannot be loaded', async () => {
    listConfigsMock.mockRejectedValueOnce(new SystemRequestError(500, '加载配置失败'))
    const { wrapper: serverErrorWrapper } = await mountConfigsPage()
    await flushPromises()

    expect(serverErrorWrapper.text()).toContain('加载配置失败')
  })

  it('shows a fallback load error for unexpected config load errors', async () => {
    listConfigsMock.mockRejectedValueOnce(new Error('network down'))
    const { wrapper: fallbackErrorWrapper } = await mountConfigsPage()
    await flushPromises()

    expect(fallbackErrorWrapper.text()).toContain('加载系统配置失败')
    expect(fallbackErrorWrapper.text()).not.toContain('network down')
  })

  it('shows create and row actions according to permissions', async () => {
    listConfigsMock.mockResolvedValue(configsResponse)
    const { wrapper: unauthorizedWrapper } = await mountConfigsPage([])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="configs-create"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="configs-edit"]').exists()).toBe(false)
    expect(unauthorizedWrapper.find('[data-test="configs-delete"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountConfigsPage([
      'system:config:create',
      'system:config:update',
      'system:config:list',
      'system:config:delete',
    ])
    await flushPromises()

    expect(authorizedWrapper.find('[data-test="configs-create"]').exists()).toBe(true)
    expect(authorizedWrapper.findAll('[data-test="configs-edit"]')).toHaveLength(2)
    expect(authorizedWrapper.findAll('[data-test="configs-delete"]')).toHaveLength(2)
  })

  it('opens create and edit drawers and refreshes after save', async () => {
    listConfigsMock.mockResolvedValue(configsResponse)
    const { wrapper } = await mountConfigsPage([
      'system:config:create',
      'system:config:update',
      'system:config:list',
    ])
    await flushPromises()

    await wrapper.get('[data-test="configs-create"]').trigger('click')
    await flushPromises()

    let drawer = wrapper.get('[data-test="config-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-config-id')).toBe('')

    await wrapper.get('[data-test="configs-edit"]').trigger('click')
    await flushPromises()

    drawer = wrapper.get('[data-test="config-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-config-id')).toBe(baseConfig.id)

    wrapper.getComponent({ name: 'ConfigFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(document.body.textContent).toContain('保存系统配置成功')
    expect(listConfigsMock).toHaveBeenCalledTimes(2)
    expect(listConfigsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  it('deletes configs after confirmation and refreshes list', async () => {
    listConfigsMock.mockResolvedValue(configsResponse)
    deleteConfigMock.mockResolvedValue(undefined)
    const { wrapper } = await mountConfigsPage(['system:config:delete'])
    await flushPromises()

    await wrapper.get('[data-test="configs-delete"]').trigger('click')
    await flushPromises()

    const confirmButton = document.body.querySelector(
      '[data-test="configs-delete-confirm"]',
    ) as HTMLButtonElement | null

    expect(confirmButton).not.toBeNull()

    confirmButton?.click()
    await flushPromises()

    expect(deleteConfigMock).toHaveBeenCalledWith(baseConfig.id)
    expect(listConfigsMock).toHaveBeenCalledTimes(2)
    expect(listConfigsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })
})
