import { z } from 'zod'
import { userCreateSchema, userSchema } from './user'

const passwordSchema = z.string().min(1)
const optionalTokenSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
)

export const authRegisterSchema = userCreateSchema
  .pick({
    username: true,
    nickname: true,
    email: true,
    phone: true,
  })
  .extend({
    password: passwordSchema,
  })
  .strict()

export const authLoginSchema = z
  .object({
    username: z.string().trim().min(1),
    password: passwordSchema,
  })
  .strict()

export const authRefreshSchema = z
  .object({
    refreshToken: optionalTokenSchema,
  })
  .strict()

export const authLogoutSchema = authRefreshSchema

export const authTokenResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
})

export const authErrorResponseSchema = z.object({
  message: z.string(),
})

export type AuthRegisterInput = z.infer<typeof authRegisterSchema>
export type AuthLoginInput = z.infer<typeof authLoginSchema>
export type AuthRefreshInput = z.infer<typeof authRefreshSchema>
export type AuthLogoutInput = z.infer<typeof authLogoutSchema>
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>
