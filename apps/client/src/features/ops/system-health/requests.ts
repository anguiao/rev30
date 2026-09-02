import { systemHealthSnapshotSchema, systemHealthJobStatisticsSchema } from '@rev30/contracts'
import { api } from '../../../api'
import { parseApiResponse } from '../../../utils/request'

export async function getSystemHealth() {
  return parseApiResponse(await api.ops['system-health'].$get(), systemHealthSnapshotSchema)
}

export async function getSystemHealthJobStatistics() {
  return parseApiResponse(
    await api.ops['system-health']['job-statistics'].$get(),
    systemHealthJobStatisticsSchema,
  )
}
