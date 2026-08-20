import type {
  ClientIpSource,
  OperationLogAction,
  OperationLogModule,
  OperationLogResult,
} from '@rev30/contracts'

export type OperationAuditEvent = Readonly<{
  actorUserId: string
  actorUsername: string
  actorNickname: string
  actorIsAdmin: boolean
  actorSessionId: string
  module: OperationLogModule
  action: OperationLogAction
  targetType: string
  targetKey: string | null
  targetLabel: string | null
  result: OperationLogResult
  httpStatus: number
  durationMs: number
  requestId: string
  clientIp: string | null
  clientIpSource: ClientIpSource
  userAgent: string | null
  createdAt: string
}>

export type OperationAuditSink = {
  enqueue(event: OperationAuditEvent): void
}

export type OperationAuditWriter = (event: OperationAuditEvent) => Promise<void>
