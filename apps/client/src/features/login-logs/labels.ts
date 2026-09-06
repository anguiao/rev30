import {
  LOGIN_FAILURE_REASON_ACCOUNT_DISABLED,
  LOGIN_FAILURE_REASON_INVALID_CREDENTIALS,
  LOGIN_FAILURE_REASON_RATE_LIMITED,
  LOGIN_LOG_RESULT_FAILURE,
  LOGIN_LOG_RESULT_SUCCESS,
  type LoginFailureReason,
  type LoginLogResult,
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
