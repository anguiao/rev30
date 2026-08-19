import {
  LOGIN_FAILURE_REASON_ACCOUNT_DISABLED,
  LOGIN_FAILURE_REASON_INVALID_CREDENTIALS,
  LOGIN_FAILURE_REASON_RATE_LIMITED,
  LOGIN_LOG_RESULT_FAILURE,
  LOGIN_LOG_RESULT_SUCCESS,
  type ClientIpSource,
  type LoginFailureReason,
  type LoginLogResult,
  type OpsDeviceType,
} from '@rev30/contracts'

export const loginLogResultLabels = {
  [LOGIN_LOG_RESULT_SUCCESS]: '成功',
  [LOGIN_LOG_RESULT_FAILURE]: '失败',
} as const satisfies Record<LoginLogResult, string>

export const loginLogResultOptions: Array<{ label: string; value: LoginLogResult }> = [
  {
    label: loginLogResultLabels[LOGIN_LOG_RESULT_SUCCESS],
    value: LOGIN_LOG_RESULT_SUCCESS,
  },
  {
    label: loginLogResultLabels[LOGIN_LOG_RESULT_FAILURE],
    value: LOGIN_LOG_RESULT_FAILURE,
  },
]

export const loginFailureReasonLabels = {
  [LOGIN_FAILURE_REASON_INVALID_CREDENTIALS]: '凭据无效',
  [LOGIN_FAILURE_REASON_ACCOUNT_DISABLED]: '账号已停用',
  [LOGIN_FAILURE_REASON_RATE_LIMITED]: '触发限流',
} as const satisfies Record<LoginFailureReason, string>

export const loginFailureReasonOptions: Array<{ label: string; value: LoginFailureReason }> = [
  {
    label: loginFailureReasonLabels[LOGIN_FAILURE_REASON_INVALID_CREDENTIALS],
    value: LOGIN_FAILURE_REASON_INVALID_CREDENTIALS,
  },
  {
    label: loginFailureReasonLabels[LOGIN_FAILURE_REASON_ACCOUNT_DISABLED],
    value: LOGIN_FAILURE_REASON_ACCOUNT_DISABLED,
  },
  {
    label: loginFailureReasonLabels[LOGIN_FAILURE_REASON_RATE_LIMITED],
    value: LOGIN_FAILURE_REASON_RATE_LIMITED,
  },
]

export const clientIpSourceLabels: Record<ClientIpSource, string> = {
  socket: 'socket',
  'x-forwarded-for': 'x-forwarded-for',
  unavailable: 'unavailable',
}

export const opsDeviceTypeLabels: Record<OpsDeviceType, string> = {
  desktop: '桌面设备',
  mobile: '移动设备',
  tablet: '平板设备',
  tv: '电视设备',
  bot: '机器人',
  unknown: '未知设备',
}
