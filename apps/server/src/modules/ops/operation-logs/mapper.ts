import type {
  ClientIpSource,
  OperationLogAction,
  OperationLogDetail,
  OperationLogListItem,
  OperationLogModule,
  OperationLogResult,
} from '@rev30/contracts'
import { toIsoDateTime } from '@rev30/utils'
import { opsOperationLogs } from '../../../db/schema'
import { toOpsUserAgent } from '../user-agent'

export type OperationLogRow = typeof opsOperationLogs.$inferSelect
export type OperationLogListRow = Pick<
  OperationLogRow,
  | 'id'
  | 'actorUserId'
  | 'actorUsername'
  | 'actorNickname'
  | 'module'
  | 'action'
  | 'targetType'
  | 'targetKey'
  | 'targetLabel'
  | 'result'
  | 'httpStatus'
  | 'durationMs'
  | 'clientIp'
  | 'createdAt'
>

export function toOperationLogListItem(row: OperationLogListRow): OperationLogListItem {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorUsername: row.actorUsername,
    actorNickname: row.actorNickname,
    module: row.module as OperationLogModule,
    action: row.action as OperationLogAction,
    targetType: row.targetType,
    targetKey: row.targetKey,
    targetLabel: row.targetLabel,
    result: row.result as OperationLogResult,
    httpStatus: row.httpStatus,
    durationMs: row.durationMs,
    clientIp: row.clientIp,
    createdAt: toIsoDateTime(row.createdAt),
  }
}

export function toOperationLogDetail(row: OperationLogRow): OperationLogDetail {
  return {
    ...toOperationLogListItem(row),
    actorIsAdmin: row.actorIsAdmin,
    actorSessionId: row.actorSessionId,
    requestId: row.requestId,
    clientIpSource: row.clientIpSource as ClientIpSource,
    userAgent: toOpsUserAgent(row.userAgent),
  }
}
