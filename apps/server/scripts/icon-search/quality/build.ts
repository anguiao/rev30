import { lookupCollection } from '@iconify/json'
import { qualitySampleExpressions, qualitySampleIds } from './sample'
import { deriveBuiltinExpressionDocument, validateExpressionRecords } from '../build/expressions'
import { reviewedCorrections } from './reviewed-corrections'

export async function buildQualitySampleDocuments() {
  const records = qualitySampleExpressions.map((record) => ({
    ...record,
    expressions: [...record.expressions],
  }))
  return buildDocuments(Object.values(qualitySampleIds), records)
}

export async function buildReviewedCorrectionDocuments() {
  const records = reviewedCorrections.map((record) => ({
    ...record,
    expressions: [...record.expressions],
  }))
  return buildDocuments([...new Set(records.map((record) => record.owner))], records)
}

async function buildDocuments(
  ids: string[],
  records: Parameters<typeof validateExpressionRecords>[0],
) {
  validateExpressionRecords(records)
  return Promise.all(
    ids.map(async (id) => {
      const [prefix, name] = id.split(':') as [string, string]
      const collection = await lookupCollection(prefix)
      return deriveBuiltinExpressionDocument(
        {
          prefix,
          collection: collection.info!.name,
          palette: Boolean(collection.info!.palette),
          icons: Object.keys(collection.icons),
          aliases: collection.aliases ?? {},
          ...(collection.categories ? { categories: collection.categories } : {}),
        },
        name,
        records,
      )
    }),
  )
}
