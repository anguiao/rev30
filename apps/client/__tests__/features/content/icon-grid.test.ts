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
  it('renders fixed grid items and emits copy actions from explicit buttons', async () => {
    const wrapper = mount(IconGrid, {
      props: {
        icons,
        scope: 'single',
      },
    })

    const item = wrapper.get('[data-test="icon-grid-item"]')
    expect(item.classes()).toContain('w-28')
    expect(item.classes()).toContain('h-32')
    expect(item.attributes('aria-label')).toBeUndefined()

    const svg = item.get('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(wrapper.get('[data-test="icon-grid-name"]').text()).toBe('logo')
    expect(wrapper.get('[data-test="icon-grid-name"]').attributes('title')).toBe('acme:logo')
    expect(wrapper.find('[data-test="icon-grid-set"]').exists()).toBe(false)

    await item.trigger('click')
    expect(wrapper.emitted('copy')).toBeUndefined()

    await wrapper.get('button[aria-label="复制图标名称"]').trigger('click')
    await wrapper.get('button[aria-label="复制 SVG"]').trigger('click')

    expect(wrapper.emitted('copy')).toEqual([['acme:logo']])
    expect(wrapper.emitted('copySvg')).toEqual([
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M0 0h24v24H0z" /></svg>',
      ],
    ])
  })

  it('can show icon set names for mixed icon set views', () => {
    const wrapper = mount(IconGrid, {
      props: {
        icons,
        scope: 'all',
      },
    })

    const setName = wrapper.get('[data-test="icon-grid-set"]')
    expect(setName.text()).toBe('Acme Icons')
    expect(setName.attributes('title')).toBe('Acme Icons')
  })

  it('uses explicit action buttons without emitting copy from rename or delete', async () => {
    const wrapper = mount(IconGrid, {
      props: {
        icons: customIcons,
        scope: 'single',
        renamable: true,
        deletable: true,
      },
    })

    const item = wrapper.get('[data-test="icon-grid-item"]')
    expect(item.classes()).toContain('h-32')
    expect(item.attributes('role')).toBeUndefined()
    expect(wrapper.get('[data-test="icon-grid-actions"]').classes()).not.toContain('absolute')

    const renameButton = wrapper.get('button[aria-label="重命名图标"]')
    await renameButton.trigger('click')
    await renameButton.trigger('keydown.enter')

    const deleteButton = wrapper.get('button[aria-label="删除图标"]')
    await deleteButton.trigger('click')
    await deleteButton.trigger('keydown.enter')

    expect(wrapper.emitted('copy')).toBeUndefined()
    expect(wrapper.emitted('copySvg')).toBeUndefined()
    expect(wrapper.emitted('rename')).toEqual([[customIcons[0]]])
    expect(wrapper.emitted('delete')).toEqual([[customIcons[0]]])
  })

  it('keeps copy actions available while hiding unavailable item actions', async () => {
    const wrapper = mount(IconGrid, {
      props: {
        icons: customIcons,
        scope: 'single',
      },
    })

    const copyButton = wrapper.get('button[aria-label="复制图标名称"]')
    await copyButton.trigger('click')

    wrapper.get('button[aria-label="复制 SVG"]')
    expect(wrapper.find('button[aria-label="重命名图标"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="删除图标"]').exists()).toBe(false)
    expect(wrapper.emitted('copy')).toEqual([['acme:logo']])
  })
})
