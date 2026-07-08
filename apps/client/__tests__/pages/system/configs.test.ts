import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../src/utils/request'
import { NDataTable } from 'naive-ui'
import { CONFIG_VALUE_TYPE_NUMBER, CONFIG_VALUE_TYPE_STRING, type Config } from '@rev30/contracts'
import { defineComponent, h } from 'vue'
import { listConfigs } from '../../../src/features/system'
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
      configKey: {
        type: String,
        default: null,
      },
    },
    emits: ['update:show', 'saved'],
    setup(props) {
      return () =>
        h('div', {
          'data-config-key': props.configKey ?? '',
          'data-show': String(props.show),
          'data-test': 'config-form-drawer',
        })
    },
  }),
}))

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  listConfigs: vi.fn(),
}))

const listConfigsMock = vi.mocked(listConfigs)

const configs: Config[] = [
  {
    key: 'auth.loginFailureMaxAttempts',
    name: '登录失败最大次数（次）',
    description: '同一用户名在窗口期内允许的失败次数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '5',
    customValue: null,
    value: '5',
  },
  {
    key: 'attachment.contentUrlTtlSeconds',
    name: '附件临时访问链接有效期（秒）',
    description: '附件临时访问链接的有效秒数。',
    valueType: CONFIG_VALUE_TYPE_NUMBER,
    defaultValue: '300',
    customValue: '600',
    value: '600',
  },
  {
    key: 'site.title',
    name: '站点标题',
    description: '后台显示标题。',
    valueType: CONFIG_VALUE_TYPE_STRING,
    defaultValue: 'Rev30',
    customValue: null,
    value: 'Rev30',
  },
]

async function mountConfigsPage(accessCodes: string[] = session.accessCodes) {
  return mountAuthRoute('/system/configs', [{ path: '/system/configs', component: ConfigsPage }], {
    ...session,
    accessCodes,
  })
}

describe('configs page', () => {
  beforeEach(() => {
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

  it('loads and renders all configs without pagination', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    expect(listConfigsMock).toHaveBeenCalledWith()
    expect(wrapper.text()).toContain('系统配置')
    expect(wrapper.text()).toContain('共 3 个')
    expect(wrapper.text()).toContain('auth.loginFailureMaxAttempts')
    expect(wrapper.text()).toContain('登录失败最大次数（次）')
    expect(wrapper.text()).toContain('数字')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.findComponent({ name: 'NPagination' }).exists()).toBe(false)
  })

  it('renders current config values with ellipsis tooltip', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    const columns = wrapper.getComponent(NDataTable).props('columns') as Array<{
      key?: string
      ellipsis?: unknown
      render?: (row: Config) => unknown
    }>
    const valueColumn = columns.find((column) => column.key === 'value')

    expect(valueColumn?.render).toBeTypeOf('function')
    expect(valueColumn?.ellipsis).toMatchObject({ tooltip: true })
    expect(valueColumn!.render!(configs[1]!)).toBe('600')
  })

  it('filters configs locally by keyword', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    await wrapper.get('[data-test="configs-keyword"] input').setValue('附件')
    await wrapper.get('[data-test="configs-search"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('attachment.contentUrlTtlSeconds')
    expect(wrapper.text()).not.toContain('auth.loginFailureMaxAttempts')
    expect(listConfigsMock).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-test="configs-reset"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('auth.loginFailureMaxAttempts')
    expect(wrapper.text()).toContain('site.title')
    expect(listConfigsMock).toHaveBeenCalledTimes(1)
  })

  it('does not render create, delete, type, status, or group filters', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage([
      'system:config:list',
      'system:config:update',
      'system:config:create',
      'system:config:delete',
    ])
    await flushPromises()

    expect(wrapper.find('[data-test="configs-create"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-delete"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-group-code"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-value-type"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="configs-status"]').exists()).toBe(false)
  })

  it('shows edit action according to update permission', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper: unauthorizedWrapper } = await mountConfigsPage(['system:config:list'])
    await flushPromises()

    expect(unauthorizedWrapper.find('[data-test="configs-edit"]').exists()).toBe(false)

    const { wrapper: authorizedWrapper } = await mountConfigsPage([
      'system:config:list',
      'system:config:update',
    ])
    await flushPromises()

    expect(authorizedWrapper.findAll('[data-test="configs-edit"]')).toHaveLength(3)
  })

  it('opens edit drawer by config key and refreshes after save', async () => {
    listConfigsMock.mockResolvedValue(configs)
    const { wrapper } = await mountConfigsPage(['system:config:list', 'system:config:update'])
    await flushPromises()

    await wrapper.get('[data-test="configs-edit"]').trigger('click')
    await flushPromises()

    const drawer = wrapper.get('[data-test="config-form-drawer"]')
    expect(drawer.attributes('data-show')).toBe('true')
    expect(drawer.attributes('data-config-key')).toBe(configs[0]!.key)

    wrapper.getComponent({ name: 'ConfigFormDrawerStub' }).vm.$emit('saved')
    await flushPromises()

    expect(document.body.textContent).toContain('系统配置已保存')
    expect(listConfigsMock).toHaveBeenCalledTimes(2)
  })

  it('shows load errors', async () => {
    listConfigsMock.mockRejectedValueOnce(new ApiRequestError(500, '加载配置失败'))
    const { wrapper } = await mountConfigsPage()
    await flushPromises()

    expect(wrapper.text()).toContain('加载配置失败')
  })
})
