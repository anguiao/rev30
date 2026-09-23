import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { CustomIconItem } from '@rev30/contracts'
import IconFormDrawer from '../../../../src/features/icons/forms/IconFormDrawer.vue'
import IconKeywordsInput from '../../../../src/features/icons/forms/IconKeywordsInput.vue'
import { createTestQueryHarness } from '../../../helpers/colada'

const icon: CustomIconItem = {
  icon: 'acme:logo',
  prefix: 'acme',
  name: 'logo',
  setName: 'Acme Icons',
  body: '<path d="M0 0h24v24H0z"/>',
  width: 24,
  height: 24,
  keywords: ['品牌'],
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
}

describe('IconFormDrawer', () => {
  it('preserves drafts when the same icon is refreshed and resets when switching icons', async () => {
    const { plugins } = createTestQueryHarness()
    const wrapper = mount(IconFormDrawer, {
      props: { show: true, icon },
      attachTo: document.body,
      global: { plugins, stubs: { teleport: true } },
    })
    await flushPromises()

    await wrapper.get('input[placeholder="请输入图标名称"]').setValue('draft-name')
    wrapper.getComponent(IconKeywordsInput).vm.$emit('update:modelValue', ['草稿关键词'])
    await flushPromises()

    await wrapper.setProps({ icon: { ...icon, keywords: ['刷新后的关键词'] } })
    await flushPromises()
    expect(wrapper.get('input[placeholder="请输入图标名称"]').element).toHaveProperty(
      'value',
      'draft-name',
    )
    expect(wrapper.getComponent(IconKeywordsInput).props('modelValue')).toEqual(['草稿关键词'])

    await wrapper.setProps({ icon: { ...icon, icon: 'acme:bell', name: 'bell', keywords: [] } })
    await flushPromises()
    expect(wrapper.get('input[placeholder="请输入图标名称"]').element).toHaveProperty(
      'value',
      'bell',
    )
    expect(wrapper.getComponent(IconKeywordsInput).props('modelValue')).toEqual([])
  })
})
