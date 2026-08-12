import { flushPromises, mount } from '@vue/test-utils'
import { NDialogProvider } from 'naive-ui'
import { computed, defineComponent, h, toRef } from 'vue'
import { describe, expect, it } from 'vitest'
import { useDrawerUnsavedChangesGuard } from '../../src/composables/useDrawerUnsavedChangesGuard'

const GuardHarness = defineComponent({
  name: 'GuardHarness',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    isDirty: {
      type: Boolean,
      required: true,
    },
  },
  emits: ['update:show'],
  setup(props, { emit }) {
    const show = computed({
      get: () => props.show,
      set: (nextShow) => emit('update:show', nextShow),
    })
    const { requestClose, handleDrawerShowUpdate } = useDrawerUnsavedChangesGuard({
      show,
      isDirty: toRef(props, 'isDirty'),
    })

    return () =>
      h('div', [
        h(
          'button',
          {
            'data-test': 'guard-request-close',
            onClick: requestClose,
          },
          'request close',
        ),
        h(
          'button',
          {
            'data-test': 'guard-show-update-open',
            onClick: () => handleDrawerShowUpdate(true),
          },
          'show update open',
        ),
        h(
          'button',
          {
            'data-test': 'guard-show-update-close',
            onClick: () => handleDrawerShowUpdate(false),
          },
          'show update close',
        ),
      ])
  },
})

const TestHost = defineComponent({
  name: 'TestHost',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    isDirty: {
      type: Boolean,
      required: true,
    },
  },
  emits: ['update:show'],
  setup(props, { emit }) {
    return () =>
      h(NDialogProvider, null, {
        default: () =>
          h(GuardHarness, {
            show: props.show,
            isDirty: props.isDirty,
            'onUpdate:show': (nextShow: boolean) => emit('update:show', nextShow),
          }),
      })
  },
})

function mountGuard(props = { show: true, isDirty: false }) {
  return mount(TestHost, {
    props,
    attachTo: document.body,
    global: {
      stubs: {
        teleport: true,
      },
    },
  })
}

async function clickAction(wrapper: ReturnType<typeof mount>, selector: string) {
  await wrapper.get(selector).trigger('click')
  await flushPromises()
}

function getDialogButton(dataTest: string) {
  const button = document.body.querySelector<HTMLButtonElement>(`[data-test="${dataTest}"]`)

  if (!button) {
    throw new Error(`Expected dialog button: ${dataTest}`)
  }

  return button
}

function dispatchBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true })

  window.dispatchEvent(event)

  return event
}

describe('useDrawerUnsavedChangesGuard', () => {
  it('closes clean drawers and ignores show updates that keep them open', async () => {
    const wrapper = mountGuard()

    await clickAction(wrapper, '[data-test="guard-request-close"]')
    await clickAction(wrapper, '[data-test="guard-show-update-open"]')
    await clickAction(wrapper, '[data-test="guard-show-update-close"]')

    expect(wrapper.emitted('update:show')).toEqual([[false], [false]])
    expect(document.body.textContent).not.toContain('放弃未保存的更改？')
  })

  it('keeps a dirty drawer open when discarding is cancelled', async () => {
    const wrapper = mountGuard({ show: true, isDirty: true })

    await clickAction(wrapper, '[data-test="guard-request-close"]')

    expect(document.body.textContent).toContain('放弃未保存的更改？')
    expect(wrapper.emitted('update:show')).toBeUndefined()

    getDialogButton('unsaved-changes-discard-cancel').click()
    await flushPromises()

    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('closes a dirty drawer after discarding from a show update', async () => {
    const wrapper = mountGuard({ show: true, isDirty: true })

    await clickAction(wrapper, '[data-test="guard-show-update-close"]')

    expect(document.body.textContent).toContain('放弃未保存的更改？')
    expect(wrapper.emitted('update:show')).toBeUndefined()

    getDialogButton('unsaved-changes-discard-confirm').click()
    await flushPromises()

    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })

  it('guards beforeunload only while the drawer is open and dirty', async () => {
    const wrapper = mountGuard()

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    await wrapper.setProps({ isDirty: true })
    await flushPromises()

    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    await wrapper.setProps({ isDirty: false })
    await flushPromises()

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    await wrapper.setProps({ show: false, isDirty: true })
    await flushPromises()

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    await wrapper.setProps({ show: true })
    await flushPromises()
    wrapper.unmount()

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })
})
