import type {
  ClientIpSource,
  LoginFailureReason,
  LoginLogResult,
  OpsDeviceType,
} from '@rev30/contracts'

export const loginLogResultLabels: Record<LoginLogResult, string> = {
  success: '成功',
  failure: '失败',
}

export const loginFailureReasonLabels: Record<LoginFailureReason, string> = {
  invalid_credentials: '凭据无效',
  account_disabled: '账号已停用',
  rate_limited: '触发限流',
}

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
