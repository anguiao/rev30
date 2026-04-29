import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { validator } from 'hono/validator'
import type {
  SystemUser,
  SystemUserCreateInput,
  SystemUserListResponse,
  SystemUserUpdateInput,
} from '@rev30/shared'

const systemUserFixture = {
  id: '8f34c0b7-f7c0-4905-a7f5-3b6d2512f6b7',
  username: 'fixture',
  nickname: 'Fixture User',
  email: null,
  phone: null,
  status: 1,
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
} satisfies SystemUser

type SystemUserListQueryInput = {
  page?: string
  pageSize?: string
  keyword?: string
  status?: string
}

const systemUserListQueryValidator = validator(
  'query',
  (value) => value as SystemUserListQueryInput,
) as MiddlewareHandler<
  {},
  string,
  {
    in: {
      query?: SystemUserListQueryInput
    }
    out: {
      query: SystemUserListQueryInput
    }
  }
>

const systemUserContract = new Hono()
  .get('/', systemUserListQueryValidator, (c) =>
    c.json({
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
    } satisfies SystemUserListResponse),
  )
  .get('/:id', (c) => c.json(systemUserFixture))
  .post(
    '/',
    validator('json', (value) => value as unknown as SystemUserCreateInput),
    (c) => c.json(systemUserFixture, 201),
  )
  .patch(
    '/:id',
    validator('json', (value) => value as unknown as SystemUserUpdateInput),
    (c) => c.json(systemUserFixture),
  )
  .delete('/:id', (c) => c.body(null, 204))

const systemContract = new Hono().route('/users', systemUserContract)

export const apiContract = new Hono()
  .get('/health', (c) =>
    c.json({
      service: 'rev30-server',
      status: 'ok',
    } as const),
  )
  .route('/system', systemContract)

export type AppType = typeof apiContract
