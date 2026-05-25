import { afterEach, vi } from 'vitest'
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

afterEach(() => {
  disposeActiveTestPinia()
  Reflect.deleteProperty(navigator, 'clipboard')
  document.body.innerHTML = ''
})
