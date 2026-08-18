import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { NConfigProvider } from 'naive-ui'
import UserAgentSummary from '../../../src/features/ops/UserAgentSummary.vue'

function mountSummary(userAgent: InstanceType<typeof UserAgentSummary>['$props']['userAgent']) {
  return mount(UserAgentSummary, {
    props: { userAgent },
    global: { components: { NConfigProvider } },
  })
}

describe('UserAgentSummary', () => {
  it('summarizes recognized browser, operating system, and device type', () => {
    const wrapper = mountSummary({
      raw: 'Mozilla/5.0 test agent',
      browser: { name: 'Chrome', version: '140.0' },
      operatingSystem: { name: 'macOS', version: '15.6' },
      deviceType: 'desktop',
    })

    expect(wrapper.text()).toBe('Chrome 140.0 · macOS 15.6 · 桌面设备')
    expect(wrapper.attributes('title')).toBe('Mozilla/5.0 test agent')
  })

  it('renders a clear fallback for an unknown device', () => {
    const wrapper = mountSummary({
      raw: 'unknown-agent',
      browser: null,
      operatingSystem: null,
      deviceType: 'unknown',
    })

    expect(wrapper.text()).toBe('未知设备')
    expect(mountSummary(null).text()).toBe('未知设备')
  })
})
