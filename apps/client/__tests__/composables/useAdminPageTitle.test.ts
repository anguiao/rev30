import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { useAdminPageTitle } from '../../src/composables/useAdminPageTitle'
import { mountAuthRoute, session } from '../helpers/auth'
const TestPage = defineComponent({
  setup() {
    const title = useAdminPageTitle('Fallback Title')

    return {
      title,
    }
  },
  template: '<h1>{{ title }}</h1>',
})

describe('useAdminPageTitle', () => {
  it('uses the current matched menu name from the auth session', async () => {
    const { wrapper } = await mountAuthRoute(
      '/system/users',
      [{ path: '/system/users', component: TestPage }],
      session,
    )
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Users')
  })

  it('uses the fallback title when the current route has no menu match', async () => {
    const { wrapper } = await mountAuthRoute(
      '/account/settings',
      [{ path: '/account/settings', component: TestPage }],
      session,
    )
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Fallback Title')
  })
})
