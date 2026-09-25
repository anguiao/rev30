import { z } from 'zod'

function blankStringToNull(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value
}

export function nonBlankString(message = '不能为空') {
  return z.string().trim().min(1, message)
}

export function uuidString(message = 'ID 无效') {
  return z.uuid(message).toLowerCase()
}

export function optionalNullableString(message = '不能为空') {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform(blankStringToNull)
    .pipe(z.union([nonBlankString(message), z.null()]).optional())
}

export const passwordInputSchema = z.string().min(8, '密码至少需要 8 位')

export const usernameInputSchema = nonBlankString('请输入用户名').max(
  64,
  '用户名不能超过 64 个字符',
)

export const sortOrderInputSchema = z.int32('排序必须是整数且在允许范围内')
