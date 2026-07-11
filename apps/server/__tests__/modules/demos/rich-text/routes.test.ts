import { describe, expect, it } from 'vitest'
import {
  RICH_TEXT_DEMO_PREVIEW_MAX_BODY_SIZE_BYTES,
  type ErrorResponse,
  type RichTextDemoPreviewResponse,
} from '@rev30/contracts'
import { createApp } from '../../../../src/app'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { createTestDb } from '../../../helpers/db'

const previewBody = {
  contentJson: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'underline' }], text: '组件演示' }],
      },
    ],
  },
}

describe('rich text demo routes', () => {
  it('requires authentication and preview access', async () => {
    const database = await createTestDb()
    const app = createApp(database)

    const unauthorizedResponse = await app.request('/api/demos/rich-text/preview', {
      method: 'POST',
      body: JSON.stringify(previewBody),
      headers: { 'content-type': 'application/json' },
    })
    const authenticated = await createSystemAccessFixture(database, {
      usernamePrefix: 'rich-text-demo-no-access',
    })
    const forbiddenResponse = await app.request('/api/demos/rich-text/preview', {
      method: 'POST',
      body: JSON.stringify(previewBody),
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
    })

    expect(unauthorizedResponse.status).toBe(401)
    expect(await unauthorizedResponse.json()).toEqual({ message: '未授权' })
    expect(forbiddenResponse.status).toBe(403)
    expect(await forbiddenResponse.json()).toEqual({ message: '无权访问' })
  })

  it('returns server-derived JSON, text, and HTML without creating a resource', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['demo:rich-text:preview'],
      usernamePrefix: 'rich-text-demo-preview',
    })
    const app = createApp(database)

    const response = await app.request('/api/demos/rich-text/preview', {
      method: 'POST',
      body: JSON.stringify(previewBody),
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as RichTextDemoPreviewResponse
    expect(body.contentText).toBe('组件演示')
    expect(body.contentHtml).toBe('<p><u>组件演示</u></p>')
    expect(body.contentJson).toMatchObject(previewBody.contentJson)
  })

  it('maps invalid all-preset content to the contentJson field', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['demo:rich-text:preview'],
      usernamePrefix: 'rich-text-demo-invalid',
    })
    const app = createApp(database)

    const response = await app.request('/api/demos/rich-text/preview', {
      method: 'POST',
      body: JSON.stringify({
        contentJson: {
          type: 'doc',
          content: [{ type: 'image', attrs: { src: 'https://example.com/image.png' } }],
        },
      }),
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(400)
    expect((await response.json()) as ErrorResponse).toEqual({
      field: 'contentJson',
      message: '富文本内容无效',
    })
  })

  it('rejects oversized preview requests before parsing JSON', async () => {
    const database = await createTestDb()
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['demo:rich-text:preview'],
      usernamePrefix: 'rich-text-demo-oversized',
    })
    const app = createApp(database)

    const response = await app.request('/api/demos/rich-text/preview', {
      method: 'POST',
      body: '{}',
      headers: {
        ...authenticated.authHeaders,
        'content-length': String(RICH_TEXT_DEMO_PREVIEW_MAX_BODY_SIZE_BYTES + 1),
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ message: '请求体过大' })
  })
})
