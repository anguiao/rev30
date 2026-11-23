import {
  ICON_CURSOR_MAX_LENGTH,
  type BuiltinIconListResponse,
  type BuiltinIconSetListResponse,
  type CustomIconListResponse,
  type CustomIconSet,
  type CustomIconUploadResponse,
  type IconSearchResponse,
} from '@rev30/contracts'
import type { IconifyJSON } from '@iconify/types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, onTestFinished, vi } from 'vitest'
import { createApp } from '../../../helpers/app'
import type { OperationLogEvent } from '../../../../src/runtime/operation-log'
import { createSystemAccessFixture } from '../../../helpers/auth'
import { dbTest } from '../../../fixtures/database'
import {
  builtinSearchFacts,
  replaceIconSearchDocuments,
  testIconSearchState,
} from '../../../fixtures/icon-search'
import { customIconSetIcons, iconSearchDocuments } from '../../../../src/db/schema'
import { formatIconSearchCursor } from '../../../../src/modules/icons/cursor'
import { setIconSearchStatus } from '../../../../src/modules/icons/search/indexing/state'
import {
  getRuntimeIconSearchConcepts,
  initializeRuntimeIconSearchConcepts,
} from '../../../../src/modules/icons/search/runtime-concepts'

function createSvg(size: number, body: string) {
  return `<svg viewBox="0 0 ${size} ${size}">${body}</svg>`
}

function createRect(fill: string) {
  return `<path fill="${fill}" d="M0 0h10v10H0z" />`
}

function createOperationLogReceiver(events: OperationLogEvent[]) {
  return (event: OperationLogEvent) => {
    events.push(event)
  }
}

describe('icon set routes', () => {
  beforeAll(() => initializeRuntimeIconSearchConcepts())

  afterEach(() => {
    vi.restoreAllMocks()
  })

  dbTest(
    'reports dictionary failure across search routes while the index prepares',
    async ({ db }) => {
      const directory = await mkdtemp(join(tmpdir(), 'icon-search-missing-concepts-'))
      onTestFinished(async () => {
        setIconSearchStatus('ready')
        await initializeRuntimeIconSearchConcepts()
        await rm(directory, { recursive: true, force: true })
      })
      await expect(initializeRuntimeIconSearchConcepts(directory)).rejects.toThrow(/ENOENT/)
      setIconSearchStatus('preparing')
      const { authHeaders: headers } = await createSystemAccessFixture(db, {
        accessCodes: ['content:icon-set:list'],
      })
      const app = createApp(db)

      for (const path of [
        '/api/icons/search?keyword=lucide:camera',
        '/api/icons/search?keyword=camera',
        '/api/content/icon-sets/builtin/icons?keyword=lucide:camera',
        '/api/content/icon-sets/custom/icons?keyword=acme:camera',
      ]) {
        const response = await app.request(path, { headers })
        expect(response.status).toBe(503)
        expect(await response.json()).toEqual({
          code: 'ICON_SEARCH_UNAVAILABLE',
          message: '图标搜索暂不可用',
        })
      }

      for (const path of [
        '/api/icons/search?limit=1',
        '/api/content/icon-sets/builtin/icons?prefix=lucide&pageSize=1',
        '/api/content/icon-sets/custom/icons?pageSize=1',
      ]) {
        expect((await app.request(path, { headers })).status).toBe(200)
      }
    },
  )

  dbTest(
    'rejects invalid upload metadata before reading files or writing icons',
    async ({ db }) => {
      const authenticated = await createSystemAccessFixture(db, {
        accessCodes: ['content:icon-set:create'],
        usernamePrefix: 'icon-metadata-invalid-user',
      })
      const app = createApp(db)
      await app.request('/api/content/icon-sets/custom', {
        method: 'POST',
        headers: { ...authenticated.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: 'acme-meta', name: 'Metadata' }),
      })
      const readFile = vi.spyOn(File.prototype, 'text')

      for (const metadata of [
        'not-json',
        JSON.stringify([{ keywords: ['---'] }]),
        JSON.stringify([{ keywords: ['one'] }, {}]),
      ]) {
        const form = new FormData()
        form.append('files', new File([createSvg(24, createRect('#000'))], 'Logo.svg'))
        form.set('metadata', metadata)
        const response = await app.request('/api/content/icon-sets/custom/acme-meta/icons', {
          method: 'POST',
          headers: authenticated.authHeaders,
          body: form,
        })
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ message: '请求体无效' })
      }

      expect(readFile).not.toHaveBeenCalled()
      expect(await db.select().from(customIconSetIcons)).toEqual([])
    },
  )

  dbTest('applies positional upload keywords and updates them transactionally', async ({ db }) => {
    const events: OperationLogEvent[] = []
    const authenticated = await createSystemAccessFixture(db, {
      accessCodes: [
        'content:icon-set:create',
        'content:icon-set:list',
        'content:icon-set:update',
        'content:icon-set:export',
      ],
      usernamePrefix: 'icon-keywords-user',
    })
    await replaceIconSearchDocuments(db, [])
    const app = createApp(db, { operationLogReceiver: createOperationLogReceiver(events) })
    await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: { ...authenticated.authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: 'acme-keywords', name: 'Keyword Icons' }),
    })

    const replaceForm = new FormData()
    replaceForm.set('duplicateStrategy', 'replace')
    replaceForm.append('files', new File([createSvg(16, createRect('#111'))], 'Logo.svg'))
    replaceForm.append('files', new File([createSvg(24, createRect('#222'))], 'Logo.svg'))
    replaceForm.set(
      'metadata',
      JSON.stringify([{ keywords: ['First Position'] }, { keywords: ['Second Position'] }]),
    )
    const uploadedResponse = await app.request(
      '/api/content/icon-sets/custom/acme-keywords/icons',
      { method: 'POST', headers: authenticated.authHeaders, body: replaceForm },
    )
    expect(uploadedResponse.status).toBe(200)
    const uploaded = (await uploadedResponse.json()) as CustomIconUploadResponse
    expect(uploaded.results).toMatchObject([
      { status: 'created', icon: { keywords: ['First Position'] } },
      { status: 'replaced', icon: { keywords: ['Second Position'] } },
    ])

    const [before] = await db.select().from(customIconSetIcons)
    const updateResponse = await app.request(
      '/api/content/icon-sets/custom/acme-keywords/icons/logo',
      {
        method: 'PATCH',
        headers: { ...authenticated.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ keywords: ['Current Keyword'] }),
      },
    )
    expect(updateResponse.status).toBe(200)
    expect(await updateResponse.json()).toMatchObject({
      icon: 'acme-keywords:logo',
      keywords: ['Current Keyword'],
    })
    const [after] = await db.select().from(customIconSetIcons)
    expect(after).toMatchObject({ id: before!.id, name: 'logo', keywords: ['Current Keyword'] })
    expect(await db.select().from(iconSearchDocuments)).toEqual([
      expect.objectContaining({
        id: 'acme-keywords:logo',
        exactKeys: expect.arrayContaining(['current keyword']),
      }),
    ])

    const foundBySelector = await app.request('/api/icons/search?keyword=current%20keyword', {
      headers: authenticated.authHeaders,
    })
    const foundByLibrary = await app.request(
      '/api/content/icon-sets/custom/icons?keyword=current%20keyword',
      { headers: authenticated.authHeaders },
    )
    const selectorBody = (await foundBySelector.json()) as IconSearchResponse
    const libraryBody = (await foundByLibrary.json()) as CustomIconListResponse
    expect(selectorBody.list).toEqual([expect.objectContaining({ icon: 'acme-keywords:logo' })])
    expect(selectorBody.list[0]).not.toHaveProperty('keywords')
    expect(libraryBody.list).toEqual([
      expect.objectContaining({ icon: 'acme-keywords:logo', keywords: ['Current Keyword'] }),
    ])
    const oldKeyword = await app.request('/api/icons/search?keyword=second%20position', {
      headers: authenticated.authHeaders,
    })
    expect(((await oldKeyword.json()) as IconSearchResponse).list).toEqual([])
    expect(events.at(-1)).toMatchObject({
      action: 'content:icon:update',
      targetKey: 'acme-keywords:logo',
      targetLabel: null,
    })

    const exportResponse = await app.request('/api/content/icon-sets/custom/acme-keywords/export', {
      headers: authenticated.authHeaders,
    })
    const exported = (await exportResponse.json()) as IconifyJSON
    expect(exported.icons.logo).not.toHaveProperty('keywords')

    const clearResponse = await app.request(
      '/api/content/icon-sets/custom/acme-keywords/icons/logo',
      {
        method: 'PATCH',
        headers: { ...authenticated.authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ keywords: [] }),
      },
    )
    expect(await clearResponse.json()).toMatchObject({ keywords: [] })
  })

  dbTest(
    'returns the cursor domain code for malformed or oversized cursors',
    async ({ db: database }) => {
      const authenticated = await createSystemAccessFixture(database, {
        accessCodes: ['content:icon-set:list'],
        usernamePrefix: 'icon-set-invalid-cursor-user',
      })
      const app = createApp(database)

      for (const source of ['builtin', 'custom']) {
        for (const cursor of ['opaque-cursor', 'a'.repeat(ICON_CURSOR_MAX_LENGTH + 1)]) {
          const response = await app.request(
            `/api/content/icon-sets/${source}/icons?cursor=${cursor}`,
            { headers: authenticated.authHeaders },
          )
          expect(response.status).toBe(400)
          expect(await response.json()).toEqual({
            code: 'INVALID_ICON_CURSOR',
            message: '分页游标无效',
          })
        }
      }
    },
  )

  dbTest.for(['builtin', 'custom'] as const)(
    'rejects out-of-range match scores in %s search cursors',
    async (source, { db }) => {
      const authenticated = await createSystemAccessFixture(db, {
        accessCodes: ['content:icon-set:list'],
        usernamePrefix: 'icon-set-cursor-range-user',
      })
      await replaceIconSearchDocuments(db, [])
      const { queryRulesVersion } = getRuntimeIconSearchConcepts()
      const cursor = formatIconSearchCursor(
        {
          source,
          query: 'camera',
          dataVersion: testIconSearchState.indexVersion,
          queryRulesVersion,
        },
        {
          tier: 0,
          matchScore: 2_147_483_648,
          rank: '0',
          preference: 0,
          id: 'test:camera',
        },
      )
      const response = await createApp(db).request(
        `/api/content/icon-sets/${source}/icons?keyword=camera&cursor=${cursor}`,
        { headers: authenticated.authHeaders },
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        code: 'INVALID_ICON_CURSOR',
        message: '分页游标无效',
      })
    },
  )

  dbTest(
    'keeps non-cursor query validation errors generic when a cursor is present',
    async ({ db: database }) => {
      const authenticated = await createSystemAccessFixture(database, {
        accessCodes: ['content:icon-set:list'],
        usernamePrefix: 'icon-set-query-validation-user',
      })
      const app = createApp(database)

      for (const source of ['builtin', 'custom']) {
        const response = await app.request(
          `/api/content/icon-sets/${source}/icons?cursor=opaque-cursor&pageSize=0`,
          { headers: authenticated.authHeaders },
        )
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ message: '查询参数无效' })
      }
    },
  )

  dbTest('lists built-in icon sets for authorized users', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:list'],
      usernamePrefix: 'icon-set-builtin-list-user',
    })
    const app = createApp(database)

    const response = await app.request('/api/content/icon-sets/builtin?keyword=lucide', {
      headers: authenticated.authHeaders,
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as BuiltinIconSetListResponse
    expect(body.list.some((item) => item.prefix === 'lucide')).toBe(true)
  })

  dbTest('lists built-in icons for authorized users', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:list'],
      usernamePrefix: 'icon-set-builtin-icons-user',
    })
    const app = createApp(database)
    await replaceIconSearchDocuments(database, [
      builtinSearchFacts('lucide', 'sun', { collection: 'Lucide' }),
    ])

    const response = await app.request(
      '/api/content/icon-sets/builtin/icons?prefix=lucide&keyword=sun',
      {
        headers: authenticated.authHeaders,
      },
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as BuiltinIconListResponse
    expect(body.list[0]?.icon.startsWith('lucide:')).toBe(true)
    expect(body.list[0]?.body).toContain('<')
    expect(typeof body.list[0]?.width).toBe('number')
    expect(typeof body.list[0]?.height).toBe('number')
  })

  dbTest('creates, uploads, lists, and exports custom icon sets', async ({ db: database }) => {
    const events: OperationLogEvent[] = []
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: [
        'content:icon-set:list',
        'content:icon-set:create',
        'content:icon-set:update',
        'content:icon-set:export',
      ],
      usernamePrefix: 'icon-set-custom-user',
    })
    const app = createApp(database, {
      operationLogReceiver: createOperationLogReceiver(events),
    })

    const createResponse = await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prefix: 'acme',
        name: 'Acme Icons',
        description: 'Acme custom icons',
      }),
    })
    const formData = new FormData()
    formData.set('duplicateStrategy', 'skip')
    formData.append(
      'files',
      new File([createSvg(24, createRect('#000'))], 'Logo.svg', { type: 'image/svg+xml' }),
    )
    formData.append(
      'files',
      new File(['not svg'], 'Private-Failure.svg', { type: 'image/svg+xml' }),
    )
    const uploadResponse = await app.request('/api/content/icon-sets/custom/acme/icons', {
      method: 'POST',
      headers: authenticated.authHeaders,
      body: formData,
    })

    const listResponse = await app.request('/api/content/icon-sets/custom/icons?prefix=acme', {
      headers: authenticated.authHeaders,
    })

    const exportResponse = await app.request('/api/content/icon-sets/custom/acme/export', {
      headers: authenticated.authHeaders,
    })

    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as CustomIconSet
    expect(created).toMatchObject({
      prefix: 'acme',
      name: 'Acme Icons',
      description: 'Acme custom icons',
      iconCount: 0,
    })

    expect(uploadResponse.status).toBe(200)
    const uploaded = (await uploadResponse.json()) as CustomIconUploadResponse
    expect(uploaded.results).toMatchObject([
      { status: 'created', icon: { icon: 'acme:logo', name: 'logo', keywords: [] } },
      { status: 'failed' },
    ])

    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as CustomIconListResponse
    expect(listBody.list).toEqual([
      expect.objectContaining({
        icon: 'acme:logo',
        prefix: 'acme',
        name: 'logo',
        keywords: [],
      }),
    ])

    expect(exportResponse.status).toBe(200)
    const exported = (await exportResponse.json()) as IconifyJSON
    expect(exportResponse.headers.get('content-disposition')).toBe(
      'attachment; filename="acme.json"',
    )
    expect(exported).toMatchObject({
      prefix: 'acme',
      aliases: {},
      icons: {
        logo: {
          width: 24,
          height: 24,
        },
      },
    })
    expect(
      events.map(({ action, result, targetKey, targetLabel }) => ({
        action,
        result,
        targetKey,
        targetLabel,
      })),
    ).toEqual([
      {
        action: 'content:icon-set:create',
        result: 'success',
        targetKey: 'acme',
        targetLabel: 'Acme Icons',
      },
      {
        action: 'content:icon:upload',
        result: 'success',
        targetKey: 'acme',
        targetLabel: null,
      },
      {
        action: 'content:icon-set:export',
        result: 'success',
        targetKey: 'acme',
        targetLabel: null,
      },
    ])
    expect(JSON.stringify(events)).not.toMatch(/Logo\.svg|Private-Failure|<svg|Acme custom icons/)
  })

  dbTest('enforces identity length limits for creation, upload, and rename', async ({ db }) => {
    const authenticated = await createSystemAccessFixture(db, {
      accessCodes: ['content:icon-set:list', 'content:icon-set:create', 'content:icon-set:update'],
      usernamePrefix: 'icon-identity-limit-user',
    })
    const app = createApp(db)
    const headers = { ...authenticated.authHeaders, 'content-type': 'application/json' }
    const prefix = 'p'.repeat(256)
    const name = 'n'.repeat(256)

    const rejectedSet = await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: `${prefix}p`, name: 'Icons' }),
    })
    expect(rejectedSet.status).toBe(400)
    const createdSet = await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix, name: 'Icons' }),
    })
    expect(createdSet.status).toBe(201)

    const formData = new FormData()
    for (const filename of [`${name}.svg`, `${name}n.svg`]) {
      formData.append('files', new File([createSvg(24, createRect('#000'))], filename))
    }
    const uploaded = await app.request(`/api/content/icon-sets/custom/${prefix}/icons`, {
      method: 'POST',
      headers: authenticated.authHeaders,
      body: formData,
    })
    expect(uploaded.status).toBe(200)
    const body = (await uploaded.json()) as CustomIconUploadResponse
    expect(body.results).toEqual([
      { status: 'created', icon: expect.objectContaining({ name }) },
      { status: 'failed', message: '图标名称不能超过 256 个字符' },
    ])

    const iconUrl = `/api/content/icon-sets/custom/${prefix}/icons/${name}`
    const rejectedRename = await app.request(iconUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'r'.repeat(257) }),
    })
    expect(rejectedRename.status).toBe(400)
    const renamed = await app.request(iconUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'r'.repeat(256) }),
    })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ name: 'r'.repeat(256) })
  })

  dbTest('records upload preprocessing failures after operation registration', async ({ db }) => {
    const events: OperationLogEvent[] = []
    const authenticated = await createSystemAccessFixture(db, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-preprocess-failure-user',
    })
    const app = createApp(db, { operationLogReceiver: createOperationLogReceiver(events) })
    await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: { ...authenticated.authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: 'preprocess', name: 'Preprocess', description: null }),
    })
    events.length = 0

    vi.spyOn(File.prototype, 'text').mockRejectedValueOnce(new Error('private file failure'))
    const formData = new FormData()
    formData.append('files', new File(['<svg />'], 'private.svg', { type: 'image/svg+xml' }))
    const response = await app.request('/api/content/icon-sets/custom/preprocess/icons', {
      method: 'POST',
      headers: authenticated.authHeaders,
      body: formData,
    })

    expect(response.status).toBe(500)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      action: 'content:icon:upload',
      result: 'failure',
      targetKey: 'preprocess',
      targetLabel: null,
    })
    expect(JSON.stringify(events)).not.toMatch(/private\.svg|private file failure|<svg/)
  })

  dbTest('rejects creating custom sets with built-in prefixes', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-conflict-user',
    })
    const app = createApp(database)

    const response = await app.request('/api/content/icon-sets/custom', {
      method: 'POST',
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prefix: 'lucide',
        name: 'Lucide Copy',
        description: null,
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: '图标集前缀已存在' })
  })

  dbTest(
    'rejects anonymous requests and invalid multipart duplicate strategies',
    async ({ db: database }) => {
      const authenticated = await createSystemAccessFixture(database, {
        accessCodes: ['content:icon-set:create'],
        usernamePrefix: 'icon-set-invalid-user',
      })
      const app = createApp(database)

      const anonymousResponse = await app.request('/api/content/icon-sets/builtin?keyword=lucide')

      const formData = new FormData()
      formData.set('duplicateStrategy', 'overwrite')
      formData.append(
        'files',
        new File([createSvg(24, createRect('#000'))], 'Logo.svg', { type: 'image/svg+xml' }),
      )
      const invalidResponse = await app.request('/api/content/icon-sets/custom/acme/icons', {
        method: 'POST',
        headers: authenticated.authHeaders,
        body: formData,
      })

      expect(anonymousResponse.status).toBe(401)
      expect(await anonymousResponse.json()).toEqual({ message: '未授权' })
      expect(invalidResponse.status).toBe(400)
      expect(await invalidResponse.json()).toEqual({ message: '请求体无效' })
    },
  )

  dbTest('rejects non-form upload bodies with 400', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-non-form-user',
    })
    const app = createApp(database)

    const response = await app.request('/api/content/icon-sets/custom/acme/icons', {
      method: 'POST',
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ duplicateStrategy: 'skip' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: '请求体无效' })
  })

  dbTest('rejects oversized custom icon upload bodies', async ({ db: database }) => {
    const authenticated = await createSystemAccessFixture(database, {
      accessCodes: ['content:icon-set:create'],
      usernamePrefix: 'icon-set-upload-limit-user',
    })
    const app = createApp(database)

    const oversizedRequestResponse = await app.request('/api/content/icon-sets/custom/acme/icons', {
      method: 'POST',
      headers: {
        ...authenticated.authHeaders,
        'content-type': 'application/octet-stream',
      },
      body: 'x'.repeat(5 * 1024 * 1024 + 1),
    })

    expect(oversizedRequestResponse.status).toBe(413)
    expect(await oversizedRequestResponse.json()).toEqual({ message: '请求体过大' })
  })

  dbTest(
    'rejects create and export operations for users without the required access',
    async ({ db: database }) => {
      const manager = await createSystemAccessFixture(database, {
        accessCodes: ['content:icon-set:create'],
        usernamePrefix: 'icon-set-creator-user',
      })
      const listOnly = await createSystemAccessFixture(database, {
        accessCodes: ['content:icon-set:list'],
        usernamePrefix: 'icon-set-list-only-user',
      })
      const app = createApp(database)

      await app.request('/api/content/icon-sets/custom', {
        method: 'POST',
        headers: {
          ...manager.authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          prefix: 'acme-export',
          name: 'Acme Export',
          description: null,
        }),
      })

      const createResponse = await app.request('/api/content/icon-sets/custom', {
        method: 'POST',
        headers: {
          ...listOnly.authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          prefix: 'acme-denied',
          name: 'Acme Denied',
          description: null,
        }),
      })
      const exportResponse = await app.request('/api/content/icon-sets/custom/acme-export/export', {
        headers: listOnly.authHeaders,
      })

      expect(createResponse.status).toBe(403)
      expect(await createResponse.json()).toEqual({ message: '无权访问' })
      expect(exportResponse.status).toBe(403)
      expect(await exportResponse.json()).toEqual({ message: '无权访问' })
    },
  )
})
