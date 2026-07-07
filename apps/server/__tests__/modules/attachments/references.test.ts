import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { attachmentReferences } from '../../../src/db/schema'
import {
  deleteAttachmentReferences,
  refreshAttachmentReferences,
  type AttachmentReferenceSource,
} from '../../../src/modules/attachments/references'
import { createTestDb } from '../../helpers/db'

function testSource(): AttachmentReferenceSource {
  return {
    sourceType: 'announcement',
    sourceId: randomUUID(),
    sourceField: 'contentJson',
  }
}

async function listSourceReferences(
  database: Awaited<ReturnType<typeof createTestDb>>,
  source: AttachmentReferenceSource,
) {
  return await database
    .select()
    .from(attachmentReferences)
    .where(
      and(
        eq(attachmentReferences.sourceType, source.sourceType),
        eq(attachmentReferences.sourceId, source.sourceId),
        eq(attachmentReferences.sourceField, source.sourceField),
      ),
    )
    .orderBy(attachmentReferences.attachmentId)
}

describe('attachment references', () => {
  it('refreshes source references with unique attachment ids', async () => {
    const database = await createTestDb()
    const source = testSource()
    const firstAttachmentId = randomUUID()
    const secondAttachmentId = randomUUID()
    const thirdAttachmentId = randomUUID()

    await refreshAttachmentReferences(database, source, [
      firstAttachmentId,
      secondAttachmentId,
      firstAttachmentId,
    ])

    expect((await listSourceReferences(database, source)).map((row) => row.attachmentId)).toEqual(
      [firstAttachmentId, secondAttachmentId].sort(),
    )

    await refreshAttachmentReferences(database, source, [thirdAttachmentId])

    expect(await listSourceReferences(database, source)).toMatchObject([
      {
        attachmentId: thirdAttachmentId,
        sourceField: source.sourceField,
        sourceId: source.sourceId,
        sourceType: source.sourceType,
      },
    ])

    await deleteAttachmentReferences(database, source)

    expect(await listSourceReferences(database, source)).toEqual([])
  })
})
