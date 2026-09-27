import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotFoundPage from '../../src/pages/404.vue'
import { mountAuthRoute, session, stubPreferredDark } from '../helpers/auth'

describe('not found page', () => {
  it('shows the missing page message and returns home', async () => {
    stubPreferredDark(false)
    const { router, wrapper } = await mountAuthRoute(
      '/404',
      [
        { path: '/404', component: NotFoundPage },
        { path: '/', component: { template: '<main>Home</main>' } },
      ],
      session,
    )

    expect(wrapper.text()).toContain('页面不存在')
    expect(wrapper.text()).toContain('你访问的页面不存在，请检查地址后重试。')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
