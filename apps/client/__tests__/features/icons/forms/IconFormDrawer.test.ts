import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { NDrawer, NDrawerContent } from 'naive-ui'
import type { CustomIconItem } from '@rev30/contracts'
import IconFormDrawer from '../../../../src/features/icons/forms/IconFormDrawer.vue'
import IconKeywordsInput from '../../../../src/features/icons/forms/IconKeywordsInput.vue'
import { createTestQueryHarness } from '../../../helpers/colada'
import { createDeferred } from '../../../helpers/promise'
import { updateCustomIcon } from '../../../../src/features/icons/requests'

vi.mock('../../../../src/features/icons/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/features/icons/requests')>()),
  updateCustomIcon: vi.fn(),
}))

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
  it('locks editing and closing until saving finishes', async () => {
    const pending = createDeferred<CustomIconItem>()
    vi.mocked(updateCustomIcon).mockReturnValueOnce(pending.promise)
    const { plugins } = createTestQueryHarness()
    const wrapper = mount(IconFormDrawer, {
      props: { show: true, icon },
      attachTo: document.body,
      global: { plugins, stubs: { teleport: true } },
    })
    await flushPromises()
    await wrapper.get('input[placeholder="请输入图标名称"]').setValue('new-name')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '保存')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.get('input[placeholder="请输入图标名称"]').attributes('disabled')).toBe('')
    expect(wrapper.get('button[aria-label="添加关键词"]').attributes('disabled')).toBe('')
    expect(wrapper.get('[data-test="icon-keywords-clear"]').attributes('disabled')).toBe('')

    expect(wrapper.getComponent(NDrawerContent).props('closable')).toBe(false)
    const cancel = wrapper.findAll('button').find((button) => button.text() === '取消')!
    expect(cancel.element.disabled).toBe(true)
    await cancel.trigger('click')
    wrapper.getComponent(NDrawer).vm.$emit('update:show', false)
    await flushPromises()
    expect(wrapper.emitted('update:show')).toBeUndefined()

    pending.resolve({ ...icon, name: 'new-name', icon: 'acme:new-name' })
    await flushPromises()
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

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
