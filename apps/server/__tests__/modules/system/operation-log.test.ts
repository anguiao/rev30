import type { UserCreateResponse } from '@rev30/contracts'
import { describe, expect } from 'vitest'
import { createApp } from '../../helpers/app'
import type { OperationLogEvent } from '../../../src/runtime/operation-log'
import { createSystemAccessFixture } from '../../helpers/auth'
import { jsonRequest, responseJson } from '../../helpers/http'
import { dbTest } from '../../fixtures/database'

const configKey = 'auth.loginFailureMaxAttempts'

function createOperationLogReceiver(events: OperationLogEvent[]) {
  return (event: OperationLogEvent) => {
    events.push(event)
  }
}

describe('system operation log integration', () => {
  dbTest(
    'records service failures after access and validation without recording config values',
    async ({ db }) => {
      const events: OperationLogEvent[] = []
      const app = createApp(db, { operationLogReceiver: createOperationLogReceiver(events) })
      const denied = await createSystemAccessFixture(db, {
        usernamePrefix: 'config-log-denied',
      })
      const admin = await createSystemAccessFixture(db, {
        admin: true,
        usernamePrefix: 'config-log-admin',
      })

      const deniedResponse = await app.request(
        `/api/system/configs/${configKey}`,
        jsonRequest({ customValue: '8' }, { method: 'PUT', headers: denied.authHeaders }),
      )
      const invalidResponse = await app.request(
        `/api/system/configs/${configKey}`,
        jsonRequest({ customValue: 8 }, { method: 'PUT', headers: admin.authHeaders }),
      )

      expect(deniedResponse.status).toBe(403)
      expect(invalidResponse.status).toBe(400)
      expect(events).toEqual([])

      const domainFailureResponse = await app.request(
        `/api/system/configs/${configKey}`,
        jsonRequest({ customValue: '100' }, { method: 'PUT', headers: admin.authHeaders }),
      )

      expect(domainFailureResponse.status).toBe(400)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        action: 'system:config:update',
        httpStatus: 400,
        module: 'system',
        result: 'failure',
        targetKey: configKey,
        targetLabel: null,
        targetType: 'config',
      })
      expect(events[0]).not.toHaveProperty('customValue')
      expect(events[0]).not.toHaveProperty('defaultValue')
      expect(events[0]).not.toHaveProperty('value')
    },
  )

  dbTest(
    'keeps user create, partial update, reset and delete operation log targets minimal',
    async ({ db }) => {
      const events: OperationLogEvent[] = []
      const app = createApp(db, { operationLogReceiver: createOperationLogReceiver(events) })
      const admin = await createSystemAccessFixture(db, {
        admin: true,
        usernamePrefix: 'user-log-admin',
      })
      const email = 'operation-log-private@example.com'
      const phone = '13900000000'
      const createResponse = await app.request(
        '/api/system/users',
        jsonRequest(
          {
            username: 'recorded-user',
            nickname: 'Recorded User',
            avatarId: null,
            email,
            phone,
            departmentIds: [],
            roleIds: [],
          },
          { method: 'POST', headers: admin.authHeaders },
        ),
      )
      const created = await responseJson<UserCreateResponse>(createResponse)

      expect(createResponse.status).toBe(201)

      const updateResponse = await app.request(
        `/api/system/users/${created.user.id}`,
        jsonRequest(
          {
            nickname: 'Updated Recorded User',
            email: 'updated-private@example.com',
            phone: null,
            avatarId: null,
          },
          { method: 'PATCH', headers: admin.authHeaders },
        ),
      )
      const resetResponse = await app.request(
        `/api/system/users/${created.user.id}/password/reset`,
        {
          method: 'POST',
          headers: admin.authHeaders,
        },
      )
      const deleteResponse = await app.request(`/api/system/users/${created.user.id}`, {
        method: 'DELETE',
        headers: admin.authHeaders,
      })

      expect(updateResponse.status).toBe(200)
      expect(resetResponse.status).toBe(200)
      expect(deleteResponse.status).toBe(204)
      expect(
        events.map(({ action, targetKey, targetLabel }) => ({ action, targetKey, targetLabel })),
      ).toEqual([
        {
          action: 'system:user:create',
          targetKey: 'recorded-user',
          targetLabel: 'Recorded User',
        },
        {
          action: 'system:user:update',
          targetKey: created.user.id,
          targetLabel: 'Updated Recorded User',
        },
        {
          action: 'system:user:reset-password',
          targetKey: created.user.id,
          targetLabel: null,
        },
        {
          action: 'system:user:delete',
          targetKey: created.user.id,
          targetLabel: null,
        },
      ])
      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(created.temporaryPassword)
      expect(serializedEvents).not.toContain(email)
      expect(serializedEvents).not.toContain(phone)
      expect(serializedEvents).not.toContain('updated-private@example.com')
      expect(serializedEvents).not.toMatch(/avatarId|departmentIds|roleIds/)
    },
  )
})
