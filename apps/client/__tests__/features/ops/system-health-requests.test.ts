import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSystemHealth,
  getSystemHealthJobStatistics,
} from '../../../src/features/ops/system-health/requests'
import { healthSnapshot, healthStatistics } from '../../helpers/system-health'
import { createFetchMock, expectFetchCall, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'
import { useAuthStore } from '../../../src/stores/auth'

beforeEach(() => {
  useAuthStore(createTestPinia()).accessToken = 'access-token'
})
describe('system health requests', () => {
  it('uses both protected GET endpoints and parses shared contracts', async () => {
    const fetchMock = createFetchMock(
      jsonResponse(healthSnapshot()),
      jsonResponse(healthStatistics()),
    )
    await expect(getSystemHealth()).resolves.toEqual(healthSnapshot())
    await expect(getSystemHealthJobStatistics()).resolves.toEqual(healthStatistics())
    expectFetchCall(fetchMock, 0, { method: 'GET', pathname: '/api/ops/system-health' })
    expectFetchCall(fetchMock, 1, {
      method: 'GET',
      pathname: '/api/ops/system-health/job-statistics',
    })
  })
  it('rejects responses outside the strict contracts', async () => {
    createFetchMock(
      jsonResponse({ ...healthSnapshot(), extra: true }),
      jsonResponse({ ...healthStatistics(), timezone: 'UTC' }),
    )
    await expect(getSystemHealth()).rejects.toThrow()
    await expect(getSystemHealthJobStatistics()).rejects.toThrow()
  })
})
