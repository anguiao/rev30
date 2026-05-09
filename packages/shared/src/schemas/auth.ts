import { z } from 'zod'
import { passwordInputSchema } from './common/inputs'
import { userCreateSchema, userSchema } from './system/users'
import { resourceTreeNodeSchema } from './system/resources'

export const AUTH_ACTION_HEADER = 'Auth-Action'
export const AUTH_ACTION_REFRESH = 'refresh'

export const authRegisterSchema = userCreateSchema
  .pick({
    username: true,
    nickname: true,
    email: true,
    phone: true,
  })
  .extend({
    password: passwordInputSchema,
  })
  .strict()

export const authLoginSchema = z
  .object({
    username: z.string().trim().min(1, '请输入用户名'),
    password: passwordInputSchema,
  })
  .strict()

export const authSessionResponseSchema = z.object({
  user: userSchema,
  accessCodes: z.array(z.string().trim().min(1)),
  menus: z.array(resourceTreeNodeSchema),
})

export const authTokenResponseSchema = authSessionResponseSchema.extend({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
})

export const authProfileUpdateSchema = userCreateSchema
  .pick({
    nickname: true,
    email: true,
    phone: true,
  })
  .strict()

export const authPasswordUpdateSchema = z
  .object({
    currentPassword: passwordInputSchema,
    newPassword: passwordInputSchema,
  })
  .strict()

export type AuthRegisterInput = z.infer<typeof authRegisterSchema>
export type AuthLoginInput = z.infer<typeof authLoginSchema>
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>
export type AuthProfileUpdateInput = z.infer<typeof authProfileUpdateSchema>
export type AuthPasswordUpdateInput = z.infer<typeof authPasswordUpdateSchema>
