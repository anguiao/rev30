import { config, enableAutoUnmount } from '@vue/test-utils'
import type { DialogApi } from 'naive-ui'
import { afterEach, vi } from 'vitest'
import { resetThemeDom } from './helpers/dom'
import { disposeActiveTestPinia } from './helpers/pinia'

vi.mock('@iconify/vue', async () => {
  const { defineComponent, h } = await vi.importActual<typeof import('vue')>('vue')

  return {
    Icon: defineComponent({
      name: 'Icon',
      props: {
        icon: {
          type: String,
          required: true,
        },
      },
      setup(props, { attrs }) {
        return () =>
          h(
            'span',
            {
              ...attrs,
              'data-test': 'iconify-icon',
              'aria-hidden': 'true',
            },
            props.icon,
          )
      },
    }),
  }
})

const testDialogReactive = {
  key: 'test-dialog',
  destroy: vi.fn(),
}
const testDialogApi: DialogApi = {
  destroyAll: vi.fn(),
  create: vi.fn(() => testDialogReactive),
  success: vi.fn(() => testDialogReactive),
  warning: vi.fn(() => testDialogReactive),
  error: vi.fn(() => testDialogReactive),
  info: vi.fn(() => testDialogReactive),
}

config.global.provide['n-dialog-api'] = testDialogApi

enableAutoUnmount(afterEach)

afterEach(() => {
  disposeActiveTestPinia()
  resetThemeDom()
  Reflect.deleteProperty(navigator, 'clipboard')
  document.body.innerHTML = ''
})
