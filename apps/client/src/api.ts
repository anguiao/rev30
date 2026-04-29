import { hc } from 'hono/client'
import type { AppType } from '@rev30/server'

export const api = hc<AppType>('/api')
