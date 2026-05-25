import { Hono } from 'hono'
import type { Db } from '../../db'
import { createAnnouncementRoutes } from './announcements/routes'
import { createMyAnnouncementRoutes } from './my-announcements/routes'

export function createContentRoutes(database: Db) {
  return new Hono()
    .route('/announcements', createAnnouncementRoutes(database))
    .route('/my-announcements', createMyAnnouncementRoutes(database))
}
