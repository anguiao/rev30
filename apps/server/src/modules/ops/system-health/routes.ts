import { systemHealthJobStatisticsSchema, systemHealthSnapshotSchema } from '@rev30/contracts'
import { Hono } from 'hono'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import type { SystemHealthService } from './service'

export function createSystemHealthRoutes(service: SystemHealthService) {
  return new Hono<AuthEnv>()
    .get('/', requireAccess('ops:system-health:list'), async (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json(systemHealthSnapshotSchema.parse(await service.snapshot()))
    })
    .get('/job-statistics', requireAccess('ops:system-health:list'), async (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json(systemHealthJobStatisticsSchema.parse(await service.jobStatistics()))
    })
}
