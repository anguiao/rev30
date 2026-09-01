import { describe, expect, it } from 'vitest'
import { scheduledJobEnabledInputSchema, scheduledJobPlanUpdateInputSchema } from '../../../src'
import { expectZodIssue } from '../../helpers/schema'

describe('scheduled job input schemas', () => {
  it('accepts exact plan update and enabled inputs', () => {
    expect(
      scheduledJobPlanUpdateInputSchema.parse({
        cronExpression: ' 0 */6 * * * ',
        timezone: ' Asia/Shanghai ',
      }),
    ).toEqual({ cronExpression: '0 */6 * * *', timezone: 'Asia/Shanghai' })
    expect(scheduledJobEnabledInputSchema.parse({ enabled: false })).toEqual({ enabled: false })
  })

  it('rejects unknown and missing plan or enabled fields', () => {
    expectZodIssue(
      scheduledJobPlanUpdateInputSchema.safeParse({
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        extra: true,
      }),
      { message: 'Unrecognized key: "extra"' },
    )
    expectZodIssue(scheduledJobPlanUpdateInputSchema.safeParse({ cronExpression: '0 * * * *' }), {
      message: '时区不能为空',
      path: ['timezone'],
    })
    expectZodIssue(scheduledJobEnabledInputSchema.safeParse({ enabled: 'false' }), {
      message: '启用状态必须是布尔值',
      path: ['enabled'],
    })
  })
})
