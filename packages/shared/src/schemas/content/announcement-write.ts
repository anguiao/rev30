import { z } from 'zod'
import { hasAnyDefinedValue } from '../common/refinements'
import { parseAnnouncementContent } from '../../utils/announcement-content'
import {
  announcementSummaryInputSchema,
  announcementTitleSchema,
  announcementTypeSchema,
  tiptapDocumentSchema,
} from './announcements'

function addAnnouncementContentIssue(contentJson: unknown, ctx: z.RefinementCtx) {
  const result = parseAnnouncementContent(contentJson)

  if (result.success) {
    return
  }

  ctx.addIssue({
    code: 'custom',
    path: ['contentJson'],
    message: result.reason === 'empty' ? '请输入公告正文' : '公告正文格式无效',
  })
}

const announcementWriteBaseFields = {
  type: announcementTypeSchema,
  title: announcementTitleSchema,
  summary: announcementSummaryInputSchema,
  contentJson: tiptapDocumentSchema,
  pinned: z.boolean(),
} satisfies z.ZodRawShape

const partialAnnouncementUpdateFieldsSchema = z
  .object({
    ...announcementWriteBaseFields,
    publish: z.boolean(),
  })
  .partial()
  .superRefine((value, ctx) => {
    if (value.contentJson !== undefined) {
      addAnnouncementContentIssue(value.contentJson, ctx)
    }
  })

type AnnouncementUpdateFields = z.infer<typeof partialAnnouncementUpdateFieldsSchema>

function hasMeaningfulAnnouncementUpdate(input: AnnouncementUpdateFields) {
  const { publish, ...rest } = input

  return publish === true || hasAnyDefinedValue(rest)
}

export const announcementCreateSchema = z
  .object({
    ...announcementWriteBaseFields,
    publish: z.boolean().default(false),
    pinned: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    addAnnouncementContentIssue(value.contentJson, ctx)
  })

export const announcementUpdateSchema = partialAnnouncementUpdateFieldsSchema.refine(
  hasMeaningfulAnnouncementUpdate,
  {
    message: '至少修改一个字段',
  },
)

export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>
