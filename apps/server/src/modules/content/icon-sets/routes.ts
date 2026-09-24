import { Hono, type Context } from 'hono'
import type { Db } from '../../../db'
import type { AuthEnv } from '../../../middleware/auth'
import { createBuiltinIconSetRoutes } from './builtin/routes'
import { createCustomIconSetRoutes } from './custom/routes'
import {
  IconSearchPreparingError,
  IconSearchUnavailableError,
  InvalidIconCursorError,
} from '../../icons/errors'

function iconSetErrorResponse(error: unknown, c: Context) {
  if (error instanceof InvalidIconCursorError) {
    return c.json({ code: error.code, message: error.message }, 400)
  }

  if (error instanceof IconSearchPreparingError || error instanceof IconSearchUnavailableError) {
    return c.json({ code: error.code, message: error.message }, 503)
  }

  throw error
}

export function createIconSetRoutes(database: Db) {
  return new Hono<AuthEnv>()
    .onError((error, c) => iconSetErrorResponse(error, c))
    .route('/builtin', createBuiltinIconSetRoutes(database))
    .route('/custom', createCustomIconSetRoutes(database))
}
