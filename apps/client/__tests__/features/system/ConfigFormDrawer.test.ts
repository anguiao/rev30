import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NRadioGroup } from 'naive-ui'
import {
  CONFIG_VALUE_TYPE_BOOLEAN,
  CONFIG_VALUE_TYPE_JSON,
  CONFIG_VALUE_TYPE_NUMBER,
  type Config,
} from '@rev30/contracts'
import { configValueTypeLabels, getConfig, updateConfig } from '../../../src/features/system'
import { ApiRequestError } from '../../../src/utils/request'
import ConfigFormDrawer from '../../../src/features/system/ConfigFormDrawer.vue'
import { createTestPinia } from '../../helpers/pinia'
import { createDeferred } from '../../helpers/promise'

vi.mock('../../../src/features/system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/system')>()),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}))

const getConfigMock = vi.mocked(getConfig)
const updateConfigMock = vi.mocked(updateConfig)

const configKey = 'auth.loginFailureMaxAttempts'
const configResponse: Config = {
  key: configKey,
  name: '登录失败最大次数（次）',
  description: '同一用户名在窗口期内允许的失败次数。',
  valueType: CONFIG_VALUE_TYPE_NUMBER,
  defaultValue: '5',
  customValue: null,
  value: '5',
}

function mountDrawer(props = { show: true, configKey }) {
  const pinia = createTestPinia()

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
  await flushPromises()
}

describe('ConfigFormDrawer', () => {
  beforeEach(() => {
    getConfigMock.mockReset()
    updateConfigMock.mockReset()
  })

  it('loads a config and submits null when using the default value', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockResolvedValue(configResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.text()).toContain('编辑系统配置')
    expect(wrapper.text()).toContain(configResponse.key)
    expect(wrapper.text()).toContain(configValueTypeLabels[configResponse.valueType])
    expect(wrapper.text()).toContain(configResponse.name)
    expect(wrapper.text()).toContain(configResponse.description)
    expect(wrapper.text()).toContain(configResponse.defaultValue)
    expect(wrapper.text()).toContain('5')

    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: null })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('uses the default value as the custom draft when enabling custom value', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockResolvedValue({ ...configResponse, customValue: '8', value: '8' })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-source"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'custom')
    await flushPromises()

    expect(
      (wrapper.get('[data-test="config-form-custom-value"] input').element as HTMLInputElement)
        .value,
    ).toBe('5')

    await wrapper.get('[data-test="config-form-custom-value"] input').setValue('8')
    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: '8' })
  })

  it('loads existing custom value in custom mode', async () => {
    getConfigMock.mockResolvedValue({ ...configResponse, customValue: '9', value: '9' })
    updateConfigMock.mockResolvedValue({ ...configResponse, customValue: '9', value: '9' })

    const wrapper = mountDrawer()
    await flushPromises()

    expect(
      wrapper
        .get('[data-test="config-form-value-source"]')
        .getComponent(NRadioGroup)
        .props('value'),
    ).toBe('custom')
    expect(
      (wrapper.get('[data-test="config-form-custom-value"] input').element as HTMLInputElement)
        .value,
    ).toBe('9')
  })

  it('uses true and false radio options for boolean values', async () => {
    getConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_BOOLEAN,
      defaultValue: 'false',
      customValue: 'true',
      value: 'true',
    })
    updateConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_BOOLEAN,
      defaultValue: 'false',
      customValue: 'false',
      value: 'false',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-custom-value"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'false')
    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: 'false' })
  })

  it('uses textarea for json custom values', async () => {
    getConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_JSON,
      defaultValue: '{"enabled":false}',
      customValue: null,
      value: '{"enabled":false}',
    })
    updateConfigMock.mockResolvedValue({
      ...configResponse,
      valueType: CONFIG_VALUE_TYPE_JSON,
      defaultValue: '{"enabled":false}',
      customValue: '{"enabled":true}',
      value: '{"enabled":true}',
    })

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-source"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'custom')
    await flushPromises()
    await wrapper
      .get('[data-test="config-form-custom-value"] textarea')
      .setValue('{"enabled":true}')
    await submitForm(wrapper)

    expect(updateConfigMock).toHaveBeenCalledWith(configKey, { customValue: '{"enabled":true}' })
  })

  it('shows client field errors for blank custom values', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockResolvedValue(configResponse)

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-source"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'custom')
    await wrapper.get('[data-test="config-form-custom-value"] input').setValue('   ')
    await submitForm(wrapper)

    expect(updateConfigMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入自定义值')
  })

  it('shows server field errors on customValue', async () => {
    getConfigMock.mockResolvedValue(configResponse)
    updateConfigMock.mockRejectedValue(
      new ApiRequestError(400, '配置值必须是 1 到 20 之间的整数', 'customValue'),
    )

    const wrapper = mountDrawer()
    await flushPromises()

    wrapper
      .get('[data-test="config-form-value-source"]')
      .getComponent(NRadioGroup)
      .vm.$emit('update:value', 'custom')
    await wrapper.get('[data-test="config-form-custom-value"] input').setValue('100')
    await submitForm(wrapper)

    expect(wrapper.text()).toContain('配置值必须是 1 到 20 之间的整数')
  })

  it('ignores stale mutation errors from a previous config session', async () => {
    const pendingUpdate = createDeferred<Config>()
    getConfigMock.mockResolvedValueOnce(configResponse).mockResolvedValueOnce({
      ...configResponse,
      key: 'attachment.contentUrlTtlSeconds',
      name: '附件临时访问链接有效期（秒）',
      description: '附件临时访问链接的有效秒数。',
      defaultValue: '300',
      value: '300',
    })
    updateConfigMock.mockImplementationOnce(() => pendingUpdate.promise)

    const wrapper = mountDrawer()
    await flushPromises()

    await submitForm(wrapper)
    expect(updateConfigMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: false, configKey })
    await flushPromises()
    await wrapper.setProps({ show: true, configKey: 'attachment.contentUrlTtlSeconds' })
    await flushPromises()

    pendingUpdate.reject(new ApiRequestError(400, '旧会话错误', 'customValue'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('旧会话错误')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(wrapper.emitted('update:show')).toBeUndefined()
  })
})
