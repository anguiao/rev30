import { getDialogButton } from '../helpers/dom'
import { flushPromises, mount } from '@vue/test-utils'
import { NDialogProvider } from 'naive-ui'
import { computed, defineComponent, h, reactive, toRef } from 'vue'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useDrawerUnsavedChangesGuard } from '../../src/composables/useDrawerUnsavedChangesGuard'

const GuardHarness = defineComponent({
  name: 'GuardHarness',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    isSaving: { type: Boolean, default: false },
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
      isSaving: toRef(props, 'isSaving'),
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
    isSaving: { type: Boolean, default: false },
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
            isSaving: props.isSaving,
            'onUpdate:show': (nextShow: boolean) => emit('update:show', nextShow),
          }),
      })
  },
})

function mountGuard(
  props: { show: boolean; isDirty: boolean; isSaving?: boolean } = { show: true, isDirty: false },
) {
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

async function mountRoutedGuard(props = { show: true, isDirty: true, isSaving: false }) {
  const state = reactive(props)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/before', component: { template: '<div>Previous page</div>' } },
      {
        path: '/edit',
        component: defineComponent({
          setup: () => () => h(GuardHarness, state),
        }),
      },
      { path: '/after', component: { template: '<div>Next page</div>' } },
    ],
  })
  await router.push('/before')
  await router.push('/edit')
  await router.isReady()

  const wrapper = mount(
    defineComponent({
      setup: () => () => h(NDialogProvider, null, { default: () => h(RouterView) }),
    }),
    { attachTo: document.body, global: { plugins: [router], stubs: { teleport: true } } },
  )
  return { router, wrapper, state }
}

async function clickAction(wrapper: ReturnType<typeof mount>, selector: string) {
  await wrapper.get(selector).trigger('click')
  await flushPromises()
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

  it('blocks dismissal and browser unloading while a clean form is saving', async () => {
    const wrapper = mountGuard({ show: true, isDirty: false, isSaving: true })
    await clickAction(wrapper, '[data-test="guard-request-close"]')
    await clickAction(wrapper, '[data-test="guard-show-update-close"]')
    expect(wrapper.emitted('update:show')).toBeUndefined()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    await wrapper.setProps({ isSaving: false })
    await clickAction(wrapper, '[data-test="guard-request-close"]')
    expect(wrapper.emitted('update:show')).toEqual([[false]])
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('keeps the drawer open if saving starts after the discard dialog is opened', async () => {
    const wrapper = mountGuard({ show: true, isDirty: true })
    await clickAction(wrapper, '[data-test="guard-request-close"]')

    await wrapper.setProps({ isSaving: true })
    getDialogButton('unsaved-changes-discard-confirm').click()
    await flushPromises()

    expect(wrapper.emitted('update:show')).toBeUndefined()
  })

  it('keeps a dirty route on cancellation and leaves only after confirming discard', async () => {
    const { router } = await mountRoutedGuard()
    const cancelledNavigation = router.push('/after')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/edit')
    getDialogButton('unsaved-changes-discard-cancel').click()
    await cancelledNavigation
    expect(router.currentRoute.value.path).toBe('/edit')

    const confirmedNavigation = router.push('/after')
    await flushPromises()
    getDialogButton('unsaved-changes-discard-confirm').click()
    await confirmedNavigation
    expect(router.currentRoute.value.path).toBe('/after')
  })

  it('protects browser back navigation and allows clean or closed drawers to leave', async () => {
    const { router, state } = await mountRoutedGuard()
    router.back()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/edit')
    getDialogButton('unsaved-changes-discard-cancel').click()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/edit')

    state.isDirty = false
    await router.push('/after')
    expect(router.currentRoute.value.path).toBe('/after')
    await router.push('/edit')
    state.isDirty = true
    state.show = false
    await router.push('/before')
    expect(router.currentRoute.value.path).toBe('/before')
  })

  it('rechecks saving when a pending discard confirmation is accepted', async () => {
    const { router, state } = await mountRoutedGuard()
    const navigation = router.push('/after')
    await flushPromises()

    state.isSaving = true
    getDialogButton('unsaved-changes-discard-confirm').click()
    await navigation

    expect(router.currentRoute.value.path).toBe('/edit')
    expect(document.body.textContent).toContain('请等待保存完成后再离开。')
  })

  it('keeps a saving route mounted until its result can be delivered', async () => {
    const { router, state } = await mountRoutedGuard({ show: true, isDirty: false, isSaving: true })
    await router.push('/after')
    expect(router.currentRoute.value.path).toBe('/edit')
    expect(document.body.textContent).toContain('请等待保存完成后再离开。')

    state.isSaving = false
    await router.push('/after')
    expect(router.currentRoute.value.path).toBe('/after')
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
