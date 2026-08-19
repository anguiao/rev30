import { z } from 'zod'
import { nonBlankString } from '../common'

export const clientIpSourceSchema = z.enum(
  ['socket', 'x-forwarded-for', 'unavailable'],
  '客户端 IP 来源无效',
)

export const opsDeviceTypeSchema = z.enum(
  ['desktop', 'mobile', 'tablet', 'tv', 'bot', 'unknown'],
  '设备类型无效',
)

const opsUserAgentProductSchema = z.object({
  name: nonBlankString(),
  version: nonBlankString().nullable(),
})

export const opsUserAgentSchema = z
  .object({
    raw: z.string().min(1).max(512),
    browser: opsUserAgentProductSchema.nullable(),
    operatingSystem: opsUserAgentProductSchema.nullable(),
    deviceType: opsDeviceTypeSchema,
  })
  .nullable()

export type ClientIpSource = z.infer<typeof clientIpSourceSchema>
export type OpsDeviceType = z.infer<typeof opsDeviceTypeSchema>
export type OpsUserAgent = z.infer<typeof opsUserAgentSchema>
