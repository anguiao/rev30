import type { TiptapDocument } from '@rev30/contracts'
import { describe, expect } from 'vitest'
import { createApp } from '../../../src/app'
import type { OperationAuditEvent } from '../../../src/modules/ops/operation-logs/types'
import { dbTest } from '../../fixtures/database'
import { createSystemAccessFixture } from '../../helpers/auth'

function createAuditSink(events: OperationAuditEvent[]) {
  return {
    enqueue(event: OperationAuditEvent) {
      events.push(event)
    },
  }
}

const contentJson: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'private body text' }] }],
}

describe('content operation audit integration', () => {
  dbTest(
    'records minimal announcement targets only after access and validation',
    async ({ db }) => {
      const events: OperationAuditEvent[] = []
      const app = createApp(db, { operationAuditSink: createAuditSink(events) })
      const denied = await createSystemAccessFixture(db, {
        usernamePrefix: 'announcement-audit-denied',
      })
      const admin = await createSystemAccessFixture(db, {
        admin: true,
        usernamePrefix: 'announcement-audit-admin',
      })
      const body = {
        type: 'notice',
        title: 'Audited announcement',
        summary: 'private summary',
        contentJson,
        visibility: 'all',
        targets: [
          {
            targetType: 'user',
            targetId: '11111111-1111-4111-8111-111111111111',
          },
        ],
      }

      const deniedResponse = await app.request('/api/content/announcements', {
        method: 'POST',
        headers: { ...denied.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const invalidResponse = await app.request('/api/content/announcements', {
        method: 'POST',
        headers: { ...admin.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'invalid' }),
      })

      expect(deniedResponse.status).toBe(403)
      expect(invalidResponse.status).toBe(400)
      expect(events).toEqual([])

      const response = await app.request('/api/content/announcements', {
        method: 'POST',
        headers: { ...admin.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(201)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        action: 'content:announcement:create',
        result: 'success',
        targetKey: null,
        targetLabel: 'Audited announcement',
      })
      expect(JSON.stringify(events)).not.toMatch(
        /private body text|private summary|contentJson|targets/,
      )

      const listResponse = await app.request('/api/content/announcements', {
        headers: admin.authHeaders,
      })
      expect(listResponse.status).toBe(200)
      expect(events).toHaveLength(1)
    },
  )
})
