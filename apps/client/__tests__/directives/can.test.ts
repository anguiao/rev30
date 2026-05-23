import { mount } from '@vue/test-utils'
import type { AuthTokenResponse } from '@rev30/shared'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../src/stores/auth'
import { canDirective } from '../../src/directives/can'
import { createTestPinia, disposeActiveTestPinia, session } from '../helpers/auth'
function mountProtectedButton(template: string, authSession: AuthTokenResponse = session) {
  const pinia = createTestPinia()
  const auth = useAuthStore(pinia)
  auth.setSession(authSession)

  const wrapper = mount(
    {
      template,
    },
    {
      global: {
        plugins: [pinia],
        directives: {
          can: canDirective,
        },
      },
    },
  )

  return { auth, wrapper }
}

describe('v-can directive', () => {
  beforeEach(() => {
    disposeActiveTestPinia()
  })

  afterEach(() => {
    disposeActiveTestPinia()
  })

  it('keeps elements when the user has the required string code', () => {
    const { wrapper } = mountProtectedButton(
      '<div><button data-test="protected" v-can="\'system:user:create\'">Create</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(true)
  })

  it('removes elements when the user lacks the required string code', () => {
    const { wrapper } = mountProtectedButton(
      '<div><button data-test="protected" v-can="\'system:user:delete\'">Delete</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(false)
  })

  it('keeps elements for .any when at least one code matches', () => {
    const { wrapper } = mountProtectedButton(
      '<div><button data-test="protected" v-can.any="[\'system:user:delete\', \'system:user:create\']">More</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(true)
  })

  it('removes elements for .all when any required code is missing', () => {
    const { wrapper } = mountProtectedButton(
      '<div><button data-test="protected" v-can.all="[\'system:role:update\', \'system:role:delete\']">Batch</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(false)
  })

  it('re-inserts elements when access codes change from unauthorized to authorized', async () => {
    const { auth, wrapper } = mountProtectedButton(
      '<div><button data-test="protected" v-can="\'system:user:delete\'">Delete</button></div>',
      {
        ...session,
        accessCodes: [],
      },
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(false)

    auth.setSession({
      ...session,
      accessCodes: ['system:user:delete'],
    })
    await nextTick()

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(true)

    auth.accessCodes = []
    await nextTick()

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(false)
  })

  it('updates when the directive binding value changes', async () => {
    const pinia = createTestPinia()
    const auth = useAuthStore(pinia)
    auth.setSession(session)
    const requiredCode = ref<string | string[]>('system:user:delete')

    const wrapper = mount(
      defineComponent({
        setup() {
          return {
            requiredCode,
          }
        },
        template: '<div><button data-test="protected" v-can="requiredCode">Action</button></div>',
      }),
      {
        global: {
          plugins: [pinia],
          directives: {
            can: canDirective,
          },
        },
      },
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(false)

    requiredCode.value = 'system:user:create'
    await nextTick()

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(true)
  })
})
