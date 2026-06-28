import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { BuiltinIconListResponse, CustomIconListResponse } from '@rev30/contracts'
import IconGrid from '../../../src/features/content/IconGrid.vue'

const icons: BuiltinIconListResponse['list'] = [
  {
    icon: 'acme:logo',
    prefix: 'acme',
    name: 'logo',
    setName: 'Acme Icons',
    body: '<path d="M0 0h24v24H0z" />',
    width: 24,
    height: 24,
  },
]

const customIcons: CustomIconListResponse['list'] = [
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
]

describe('IconGrid', () => {
  it('renders fixed grid items and emits copy when clicking an icon', async () => {
    const wrapper = mount(IconGrid, {
      props: {
        icons,
        editable: false,
      },
    })

    const item = wrapper.get('[data-test="icon-grid-item"]')
    expect(item.classes()).toContain('w-44')
    expect(item.classes()).toContain('h-22')
    expect(item.attributes('aria-label')).toBe('复制图标 acme:logo')

    const svg = item.get('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(wrapper.get('[data-test="icon-grid-name"]').text()).toBe('logo')

    await item.trigger('click')

    expect(wrapper.emitted('copy')).toEqual([['acme:logo']])
  })

  it('uses explicit action buttons in editable mode without emitting copy from rename or delete', async () => {
    const wrapper = mount(IconGrid, {
      props: {
        icons: customIcons,
        editable: true,
      },
    })

    const item = wrapper.get('[data-test="icon-grid-item"]')
    expect(item.classes()).toContain('h-24')
    expect(item.attributes('role')).toBeUndefined()
    expect(wrapper.get('[data-test="icon-grid-actions"]').classes()).not.toContain('absolute')

    const renameButton = wrapper.get('button[aria-label="重命名图标"]')
    await renameButton.trigger('click')
    await renameButton.trigger('keydown.enter')

    const deleteButton = wrapper.get('button[aria-label="删除图标"]')
    await deleteButton.trigger('click')
    await deleteButton.trigger('keydown.enter')

    expect(wrapper.emitted('copy')).toBeUndefined()
    expect(wrapper.emitted('rename')).toEqual([[customIcons[0]]])
    expect(wrapper.emitted('delete')).toEqual([[customIcons[0]]])
  })

  it('keeps copy available while hiding restricted editable actions', async () => {
    const wrapper = mount(IconGrid, {
      props: {
        icons: customIcons,
        editable: true,
        canRename: false,
        canDelete: false,
      },
    })

    const copyButton = wrapper.get('button[aria-label="复制图标"]')
    await copyButton.trigger('click')

    expect(wrapper.find('button[aria-label="重命名图标"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="删除图标"]').exists()).toBe(false)
    expect(wrapper.emitted('copy')).toEqual([['acme:logo']])
  })
})
