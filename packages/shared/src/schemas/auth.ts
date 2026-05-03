import { z } from 'zod'
import {
  nullableContactInputSchema,
  userCreateSchema,
  userSchema,
  userUniqueFieldSchema,
} from './system/users'

const passwordSchema = z.string().min(8, '密码至少需要 8 位')

export const authRegisterSchema = userCreateSchema
  .pick({
    username: true,
    nickname: true,
  })
  .extend({
    email: nullableContactInputSchema.default(null),
    phone: nullableContactInputSchema.default(null),
    password: passwordSchema,
  })
  .strict()

export const authLoginSchema = z
  .object({
    username: z.string().trim().min(1, '请输入用户名'),
    password: passwordSchema,
  })
  .strict()

export const authTokenResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
})

export const authErrorResponseSchema = z.object({
  field: userUniqueFieldSchema.optional(),
  message: z.string(),
})

export type AuthRegisterInput = z.infer<typeof authRegisterSchema>
export type AuthLoginInput = z.infer<typeof authLoginSchema>
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>
