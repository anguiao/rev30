import {
  type OperationLogDetail,
  operationLogDetailSchema,
  type OperationLogListQuery,
  type OperationLogListResponse,
  operationLogListResponseSchema,
} from '@rev30/contracts'
import { api } from '../../api'
import { normalizeRequestQuery, parseApiResponse } from '../../utils/request'

export async function listOperationLogs(
  query: OperationLogListQuery,
): Promise<OperationLogListResponse> {
  return parseApiResponse(
    await api.ops['operation-logs'].$get({ query: normalizeRequestQuery(query) }),
    operationLogListResponseSchema,
  )
}

export async function getOperationLog(id: string): Promise<OperationLogDetail> {
  return parseApiResponse(
    await api.ops['operation-logs'][':id'].$get({ param: { id } }),
    operationLogDetailSchema,
  )
}
