import { beforeEach, describe, expect, it } from 'vitest'
import { getConfig, listConfigs, updateConfig } from '../../../src/features/configs/requests'
import { useAuthStore } from '../../../src/stores/auth'
import { createFetchMock, expectFetchCall, expectJsonBody, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

beforeEach(() => {
  createTestPinia()
})

describe('configs request helpers', () => {
  it('lists registry-backed configs without query params', async () => {
    const fetchMock = createFetchMock(
      jsonResponse([
        {
          key: 'auth.loginFailureMaxAttempts',
          name: '登录失败最大次数（次）',
          description: '同一用户名在窗口期内允许的失败次数。',
          valueType: 'number',
          defaultValue: '5',
          customValue: null,
          value: '5',
        },
      ]),
    )
    useAuthStore().accessToken = 'access-token'

    await expect(listConfigs()).resolves.toEqual([
      expect.objectContaining({
        key: 'auth.loginFailureMaxAttempts',
        value: '5',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/configs',
    })
  })

  it('gets and updates config custom values by key', async () => {
    const response = {
      key: 'auth.loginFailureMaxAttempts',
      name: '登录失败最大次数（次）',
      description: '同一用户名在窗口期内允许的失败次数。',
      valueType: 'number',
      defaultValue: '5',
      customValue: '8',
      value: '8',
    }
    const fetchMock = createFetchMock(jsonResponse(response), jsonResponse(response))
    useAuthStore().accessToken = 'access-token'

    await expect(getConfig('auth.loginFailureMaxAttempts')).resolves.toEqual(response)
    expectFetchCall(fetchMock, 0, {
      method: 'GET',
      pathname: '/api/system/configs/auth.loginFailureMaxAttempts',
    })

    await expect(
      updateConfig('auth.loginFailureMaxAttempts', { customValue: '8' }),
    ).resolves.toEqual(response)
    expectFetchCall(fetchMock, 1, {
      method: 'PUT',
      pathname: '/api/system/configs/auth.loginFailureMaxAttempts',
    })
    expectJsonBody(fetchMock, 1, { customValue: '8' })
  })
})
