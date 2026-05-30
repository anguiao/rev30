import { z } from 'zod'
import { passwordInputSchema } from './common/inputs'
import { userAvatarIdSchema, userCreateSchema, userSchema } from './system/users'
import { resourceTreeNodeSchema } from './system/resources'

export const AUTH_ACTION_HEADER = 'Auth-Action'
export const AUTH_ACTION_REFRESH = 'refresh'

export const authLoginSchema = z
  .object({
    username: z.string().trim().min(1, '请输入用户名'),
    password: z.string().refine((value) => value.trim().length > 0, '请输入密码'),
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
  .extend({
    avatarId: userAvatarIdSchema.nullable().optional(),
  })
  .strict()

export const authPasswordUpdateSchema = z
  .object({
    currentPassword: passwordInputSchema,
    newPassword: passwordInputSchema,
  })
  .strict()

export type AuthLoginInput = z.infer<typeof authLoginSchema>
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>
export type AuthProfileUpdateInput = z.infer<typeof authProfileUpdateSchema>
export type AuthPasswordUpdateInput = z.infer<typeof authPasswordUpdateSchema>
