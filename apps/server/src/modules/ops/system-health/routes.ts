import { systemHealthJobStatisticsSchema, systemHealthSnapshotSchema } from '@rev30/contracts'
import { Hono } from 'hono'
import type { Db } from '../../../db'
import { requireAccess } from '../../../middleware/access'
import type { AuthEnv } from '../../../middleware/auth'
import type { RequestContextEnv } from '../../../middleware/request-context'
import type { ScheduledJobService } from '../scheduled-jobs/service'
import { createSystemHealthService } from './service'

export function createSystemHealthRoutes(
  database: Db,
  scheduledJobs: Pick<ScheduledJobService, 'diagnostics' | 'getTaskName'>,
) {
  const service = createSystemHealthService(database, scheduledJobs)

  return new Hono<AuthEnv & RequestContextEnv>()
    .get('/', requireAccess('ops:system-health:list'), async (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json(
        systemHealthSnapshotSchema.parse(await service.snapshot(c.get('requestContext').logger)),
      )
    })
    .get('/job-statistics', requireAccess('ops:system-health:list'), async (c) => {
      c.header('Cache-Control', 'no-store')
      return c.json(systemHealthJobStatisticsSchema.parse(await service.jobStatistics()))
    })
}
