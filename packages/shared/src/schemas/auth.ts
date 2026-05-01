import { z } from 'zod'
import { userCreateSchema, userSchema } from './system/users'

const passwordSchema = z.string().min(8)

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

export const authRefreshTokenRequestSchema = z
  .object({
    refreshToken: z.string().trim().optional(),
  })
  .strict()

export const authRefreshSchema = authRefreshTokenRequestSchema
export const authLogoutSchema = authRefreshTokenRequestSchema

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
export type AuthRefreshTokenRequestInput = z.infer<typeof authRefreshTokenRequestSchema>
export type AuthRefreshInput = AuthRefreshTokenRequestInput
export type AuthLogoutInput = AuthRefreshTokenRequestInput
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>
