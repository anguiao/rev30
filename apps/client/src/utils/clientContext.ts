import { type ClientIpSource, type OpsDeviceType } from '@rev30/contracts'

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
