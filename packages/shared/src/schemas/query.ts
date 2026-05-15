import { z } from 'zod'

const blankQueryStringSchema = z
  .string()
  .trim()
  .length(0)
  .transform(() => undefined)
type NumericQuerySchema = Parameters<ReturnType<typeof z.coerce.number>['pipe']>[0]

export function optionalQueryValue<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([blankQueryStringSchema, schema]).optional()
}

export function optionalTrimmedQueryString() {
  return optionalQueryValue(z.string().trim().min(1))
}

export function optionalNumericQueryValue<TSchema extends NumericQuerySchema>(schema: TSchema) {
  return optionalQueryValue(z.coerce.number().pipe(schema))
}

export function includeIdsQueryValue<TSchema extends z.ZodType<string>>(schema: TSchema) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') {
      return []
    }

    const values = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    return [...new Set(values)]
  }, z.array(schema))
}
