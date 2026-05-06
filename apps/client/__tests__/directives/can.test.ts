// @vitest-environment happy-dom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../src/stores/auth'
import { can } from '../../src/directives/can'
import { createTestPinia, disposeActiveTestPinia, session } from '../helpers/auth'

enableAutoUnmount(afterEach)

function mountProtectedButton(template: string) {
  const pinia = createTestPinia()
  useAuthStore(pinia).setSession(session)

  return mount(
    {
      template,
    },
    {
      global: {
        plugins: [pinia],
        directives: {
          can,
        },
      },
    },
  )
}

describe('v-can directive', () => {
  beforeEach(() => {
    disposeActiveTestPinia()
  })

  afterEach(() => {
    disposeActiveTestPinia()
  })

  it('keeps elements when the user has the required string code', () => {
    const wrapper = mountProtectedButton(
      '<div><button data-test="protected" v-can="\'system:user:create\'">Create</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(true)
  })

  it('removes elements when the user lacks the required string code', () => {
    const wrapper = mountProtectedButton(
      '<div><button data-test="protected" v-can="\'system:user:delete\'">Delete</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(false)
  })

  it('keeps elements for .any when at least one code matches', () => {
    const wrapper = mountProtectedButton(
      '<div><button data-test="protected" v-can.any="[\'system:user:delete\', \'system:user:create\']">More</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(true)
  })

  it('removes elements for .all when any required code is missing', () => {
    const wrapper = mountProtectedButton(
      '<div><button data-test="protected" v-can.all="[\'system:role:update\', \'system:role:delete\']">Batch</button></div>',
    )

    expect(wrapper.find('[data-test="protected"]').exists()).toBe(false)
  })
})
