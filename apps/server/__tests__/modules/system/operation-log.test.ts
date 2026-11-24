import { randomUUID } from 'node:crypto'
import type {
  User,
  UserCreateResponse,
  UserListResponse,
  UserResetPasswordResponse,
} from '@rev30/contracts'
import { describe, expect } from 'vitest'
import { createApp } from '../../helpers/app'
import type { OperationLogEvent } from '../../../src/runtime/operation-log'
import { createSystemAccessFixture } from '../../helpers/auth'
import { jsonRequest, responseJson } from '../../helpers/http'
import { createSystemUserFixture } from '../../helpers/system'
import { dbTest } from '../../fixtures/database'

const configKey = 'auth.loginFailureMaxAttempts'

function createOperationLogReceiver(events: OperationLogEvent[]) {
  return (event: OperationLogEvent) => {
    events.push(event)
  }
}

describe('system operation log integration', () => {
  dbTest('audits a filtered user list and GET and HEAD details once each', async ({ db }) => {
    const events: OperationLogEvent[] = []
    const app = createApp(db, { operationLogReceiver: createOperationLogReceiver(events) })
    const reader = await createSystemAccessFixture(db, {
      accessCodes: ['system:user:list'],
      usernamePrefix: 'user-log-reader',
    })
    const headers = reader.authHeaders
    const keyword = 'sensitive-user-list-filter'
    const contacts = { email: 'audited-user@example.com', phone: '13900000001' }
    const user = await createSystemUserFixture(db, {
      username: 'audited-user',
      nickname: `Match for ${keyword}`,
      ...contacts,
    })
    const path = `/api/system/users/${user.id}`

    const list = await app.request(`/api/system/users?keyword=${keyword}&pageSize=5`, { headers })
    expect(list.status).toBe(200)
    expect((await responseJson<UserListResponse>(list)).list).toEqual([
      expect.objectContaining({ id: user.id, ...contacts }),
    ])
    expect(events).toEqual([
      expect.objectContaining({
        action: 'system:user:list',
        actorUserId: reader.userId,
        actorIsAdmin: false,
        targetType: 'user',
        targetKey: null,
        targetLabel: null,
        httpStatus: 200,
        result: 'success',
      }),
    ])
    expect(JSON.stringify(events)).not.toContain(user.id)

    const detail = await app.request(path, { headers })
    expect(detail.status).toBe(200)
    expect(await responseJson<User>(detail)).toMatchObject({ id: user.id, ...contacts })

    const head = await app.request(path, { method: 'HEAD', headers })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')

    const detailEvent = expect.objectContaining({
      action: 'system:user:view',
      actorUserId: reader.userId,
      targetType: 'user',
      targetKey: user.id,
      targetLabel: null,
      httpStatus: 200,
      result: 'success',
    })
    expect(events.slice(1)).toEqual([detailEvent, detailEvent])
    expect(events.map((event) => event.requestId)).toEqual(
      [list, detail, head].map((response) => response.headers.get('x-request-id')),
    )
    const serializedEvents = JSON.stringify(events)
    expect(serializedEvents).not.toContain(keyword)
    expect(serializedEvents).not.toContain(contacts.email)
    expect(serializedEvents).not.toContain(contacts.phone)
  })

  dbTest(
    'audits missing users after validation and leaves options unregistered',
    async ({ db }) => {
      const events: OperationLogEvent[] = []
      const app = createApp(db, { operationLogReceiver: createOperationLogReceiver(events) })
      const reader = await createSystemAccessFixture(db, { accessCodes: ['system:user:list'] })
      const denied = await createSystemAccessFixture(db)
      const missingId = randomUUID()
      const path = `/api/system/users/${missingId}`

      expect((await app.request(path)).status).toBe(401)
      expect((await app.request(path, { headers: denied.authHeaders })).status).toBe(403)
      expect(
        (await app.request('/api/system/users/not-a-uuid', { headers: reader.authHeaders })).status,
      ).toBe(400)
      expect(
        (await app.request('/api/system/users?page=0', { headers: reader.authHeaders })).status,
      ).toBe(400)
      expect(
        (
          await app.request(`/api/system/users/options?includeIds=${reader.userId}`, {
            headers: reader.authHeaders,
          })
        ).status,
      ).toBe(200)
      expect(events).toEqual([])

      const missing = await app.request(path, { headers: reader.authHeaders })
      expect(missing.status).toBe(404)
      expect(await missing.json()).toEqual({ message: '用户不存在' })
      expect(events).toEqual([
        expect.objectContaining({
          action: 'system:user:view',
          actorUserId: reader.userId,
          targetKey: missingId,
          targetLabel: null,
          httpStatus: 404,
          result: 'failure',
        }),
      ])
    },
  )

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
      const reset = await responseJson<UserResetPasswordResponse>(resetResponse)
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
      expect(serializedEvents).not.toContain(reset.temporaryPassword)
      expect(serializedEvents).not.toContain(email)
      expect(serializedEvents).not.toContain(phone)
      expect(serializedEvents).not.toContain('updated-private@example.com')
      expect(serializedEvents).not.toMatch(/avatarId|departmentIds|roleIds/)
    },
  )
})
