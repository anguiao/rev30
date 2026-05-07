import { z } from 'zod'

export const pageSchema = z.coerce
  .number('页码必须是数字')
  .int('页码必须是整数')
  .min(1, '页码不能小于 1')

export const pageSizeSchema = z.coerce
  .number('每页数量必须是数字')
  .int('每页数量必须是整数')
  .min(1, '每页数量不能小于 1')
  .max(100, '每页数量不能超过 100')

export const paginationQuerySchema = z.object({
  page: pageSchema.default(1),
  pageSize: pageSizeSchema.default(20),
})
