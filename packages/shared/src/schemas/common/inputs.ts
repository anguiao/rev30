import { z } from 'zod'

function blankStringToNull(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value
}

export function nonBlankString(message = '不能为空') {
  return z.string().trim().min(1, message)
}

export function optionalNullableInput<TSchema extends z.ZodType>(schema: TSchema) {
  return z.preprocess(blankStringToNull, z.union([schema, z.null()])).optional()
}

export function optionalNullableString(message = '不能为空') {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform(blankStringToNull)
    .pipe(z.union([nonBlankString(message), z.null()]).optional())
}

export const sortOrderInputSchema = z.number('排序必须是数字').int('排序必须是整数')
