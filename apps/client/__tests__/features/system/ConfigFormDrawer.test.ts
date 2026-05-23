import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NInputNumber, NSelect, NSwitch } from 'naive-ui'
import {
  CONFIG_STATUS_ENABLED,
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_STRING,
  type Config,
} from '@rev30/shared'
import {
  createConfig,
  getConfig,
  SystemRequestError,
  updateConfig,
} from '../../../src/features/system'
import ConfigFormDrawer from '../../../src/features/system/ConfigFormDrawer.vue'
vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  createConfig: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}))

const createConfigMock = vi.mocked(createConfig)
const getConfigMock = vi.mocked(getConfig)
const updateConfigMock = vi.mocked(updateConfig)

const configId = '11111111-1111-4111-8111-111111111111'
const configResponse: Config = {
  id: configId,
  groupCode: 'site',
  key: 'site.title',
  name: '站点名称',
  valueType: CONFIG_VALUE_TYPE_STRING,
  value: 'Rev30',
  description: '后台显示名称',
  status: CONFIG_STATUS_ENABLED,
  sortOrder: 2,
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
}
const updatedConfigResponse: Config = {
  ...configResponse,
  name: '新站点名称',
  value: 'Rev30 Admin',
  updatedAt: '2026-05-20T00:00:00.000Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

function mountDrawer(props = { show: true, configId: null as string | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(ConfigFormDrawer, {
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

async function submitForm(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="config-form-submit"]').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('ConfigFormDrawer', () => {
  beforeEach(() => {
    createConfigMock.mockReset()
    getConfigMock.mockReset()
    updateConfigMock.mockReset()
  })

  it('submits a new string config in create mode', async () => {
    createConfigMock.mockResolvedValue(configResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('新增系统配置')
    await wrapper.get('[data-test="config-form-group-code"] input').setValue('site')
    await wrapper.get('[data-test="config-form-key"] input').setValue('site.title')
    await wrapper.get('[data-test="config-form-name"] input').setValue('站点名称')
    await wrapper.get('[data-test="config-form-value"] input').setValue('Rev30')
    await wrapper.get('[data-test="config-form-description"] textarea').setValue('后台显示名称')
    wrapper.getComponent(NInputNumber).vm.$emit('update:value', 2)
    await flushPromises()

    await submitForm(wrapper)

    expect(createConfigMock).toHaveBeenCalledWith({
      groupCode: 'site',
      key: 'site.title',
      name: '站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      description: '后台显示名称',
      status: CONFIG_STATUS_ENABLED,
      sortOrder: 2,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('loads config detail and submits updates in edit mode', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockResolvedValue({ ...configResponse, name: '新站点名称' })

    const wrapper = mountDrawer({ show: true, configId })
    await flushPromises()

    expect(wrapper.text()).toContain('编辑系统配置')
    expect(getConfigMock).toHaveBeenCalledWith(configId)
    expect(
      (wrapper.get('[data-test="config-form-key"] input').element as HTMLInputElement).value,
    ).toBe('site.title')

    await wrapper.get('[data-test="config-form-name"] input').setValue('新站点名称')
    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configId, {
      groupCode: 'site',
      key: 'site.title',
      name: '新站点名称',
      valueType: CONFIG_VALUE_TYPE_STRING,
      value: 'Rev30',
      description: '后台显示名称',
      status: CONFIG_STATUS_ENABLED,
      sortOrder: 2,
    })
  })

  it('reloads detail when reopening the same config after save', async () => {
    getConfigMock.mockResolvedValueOnce(configResponse).mockResolvedValueOnce(updatedConfigResponse)
    updateConfigMock.mockResolvedValue(updatedConfigResponse)

    const wrapper = mountDrawer({ show: true, configId })
    await flushPromises()

    await wrapper.get('[data-test="config-form-name"] input').setValue('新站点名称')
    await wrapper.get('[data-test="config-form-value"] input').setValue('Rev30 Admin')
    await submitForm(wrapper)

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])

    await wrapper.setProps({ show: false, configId })
    await flushPromises()
    await wrapper.setProps({ show: true, configId })
    await flushPromises()

    expect(getConfigMock).toHaveBeenCalledTimes(2)
    expect(
      (wrapper.get('[data-test="config-form-name"] input').element as HTMLInputElement).value,
    ).toBe(updatedConfigResponse.name)
    expect(
      (wrapper.get('[data-test="config-form-value"] input').element as HTMLInputElement).value,
    ).toBe(updatedConfigResponse.value)
  })

  it('uses a switch for boolean values and submits true or false strings', async () => {
    createConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_BOOLEAN,
      value: 'true',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-type"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', CONFIG_VALUE_TYPE_BOOLEAN)
    await flushPromises()
    wrapper.getComponent(NSwitch).vm.$emit('update:value', true)
    await wrapper.get('[data-test="config-form-group-code"] input').setValue('feature')
    await wrapper.get('[data-test="config-form-key"] input').setValue('feature.enabled')
    await wrapper.get('[data-test="config-form-name"] input').setValue('功能启用')

    await submitForm(wrapper)

    expect(createConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        valueType: CONFIG_VALUE_TYPE_BOOLEAN,
        value: 'true',
      }),
    )
  })

  it('uses textarea for json values', async () => {
    createConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_JSON,
      value: '{"enabled":true}',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-type"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', CONFIG_VALUE_TYPE_JSON)
    await flushPromises()
    await wrapper.get('[data-test="config-form-value"] textarea').setValue('{"enabled":true}')
    await wrapper.get('[data-test="config-form-group-code"] input').setValue('feature')
    await wrapper.get('[data-test="config-form-key"] input').setValue('feature.flags')
    await wrapper.get('[data-test="config-form-name"] input').setValue('功能配置')
    await submitForm(wrapper)

    expect(createConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        valueType: CONFIG_VALUE_TYPE_JSON,
        value: '{"enabled":true}',
      }),
    )
  })

  it('shows load errors and disables submit in edit mode', async () => {
    getConfigMock.mockRejectedValue(new Error('network'))

    const wrapper = mountDrawer({ show: true, configId })
    await flushPromises()

    expect(wrapper.text()).toContain('加载系统配置信息失败')
    expect(wrapper.get('[data-test="config-form-submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows server field errors on value', async () => {
    createConfigMock.mockRejectedValue(new SystemRequestError(400, '配置值必须是有限数字', 'value'))

    const wrapper = mountDrawer()
    await flushPromises()

    await wrapper.get('[data-test="config-form-group-code"] input').setValue('site')
    await wrapper.get('[data-test="config-form-key"] input').setValue('site.limit')
    await wrapper.get('[data-test="config-form-name"] input').setValue('限制')
    wrapper
      .get('[data-test="config-form-value-type"]')
      .getComponent(NSelect)
      .vm.$emit('update:value', 'number')
    await wrapper.get('[data-test="config-form-value"] input').setValue('123')
    await submitForm(wrapper)

    expect(wrapper.text()).toContain('配置值必须是有限数字')
  })

  it('ignores stale mutation errors from a previous create session', async () => {
    const pendingCreate = deferred<Config>()
    createConfigMock.mockImplementationOnce(() => pendingCreate.promise)

    const wrapper = mountDrawer({ show: true, configId: null })
    await flushPromises()

    await wrapper.get('[data-test="config-form-group-code"] input').setValue('site')
    await wrapper.get('[data-test="config-form-key"] input').setValue('site.title')
    await wrapper.get('[data-test="config-form-name"] input').setValue('旧会话')
    await wrapper.get('[data-test="config-form-value"] input').setValue('Rev30')
    await submitForm(wrapper)

    expect(createConfigMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: false, configId: null })
    await flushPromises()
    await wrapper.setProps({ show: true, configId: null })
    await flushPromises()

    await wrapper.get('[data-test="config-form-group-code"] input').setValue('site')
    await wrapper.get('[data-test="config-form-key"] input').setValue('site.subtitle')
    await wrapper.get('[data-test="config-form-name"] input').setValue('新会话')

    pendingCreate.reject(new SystemRequestError(400, '旧会话错误', 'key'))
    await flushPromises()

    const keyFieldContainer = wrapper
      .get('[data-test="config-form-key"]')
      .element.closest('.n-form-item')

    expect(keyFieldContainer?.textContent).not.toContain('旧会话错误')
    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })
})
