import type {
  CustomIconDuplicateStrategy,
  CustomIconSetCreateInput,
  CustomIconSetUpdateInput,
  CustomIconUploadFailed,
  CustomIconUploadResponse,
  IconSetIconListQuery,
  IconSetListQuery,
  IconSetRenameIconInput,
} from '@rev30/contracts'
import type { Db } from '../../../../db'
import { loadIconCollections } from '../../../icons/search/collections'
import {
  CustomIconConflictError,
  CustomIconNotFoundError,
  CustomIconSetConflictError,
  CustomIconSetNotFoundError,
  CustomSvgInvalidError,
} from './errors'
import { exportCustomIconSet } from './export'
import { mapCustomIcon, mapCustomIconSet } from './mapper'
import { createCustomIconSetRepository } from './repository'
import { parseSvgIcon } from './svg'

type CustomIconUploadInput = {
  duplicateStrategy: CustomIconDuplicateStrategy
  files: Array<{ filename: string; content: string }>
}

async function hasBuiltinPrefix(prefix: string) {
  const collections = await loadIconCollections()

  return collections[prefix] !== undefined
}

export function createCustomIconSetService(database: Db) {
  const repository = createCustomIconSetRepository(database)

  async function getSetOrThrow(prefix: string) {
    const set = await repository.findSetByPrefix(prefix)

    if (!set) {
      throw new CustomIconSetNotFoundError()
    }

    return set
  }

  return {
    async list(query: IconSetListQuery) {
      const result = await repository.listSets(query)

      return {
        ...result,
        list: result.list.map(mapCustomIconSet),
      }
    },

    async get(prefix: string) {
      const set = await repository.getSet(prefix)

      if (!set) {
        throw new CustomIconSetNotFoundError()
      }

      return mapCustomIconSet(set)
    },

    async create(input: CustomIconSetCreateInput) {
      if (
        (await repository.hasCustomPrefix(input.prefix)) ||
        (await hasBuiltinPrefix(input.prefix))
      ) {
        throw new CustomIconSetConflictError()
      }

      return mapCustomIconSet(await repository.createSet(input))
    },

    async update(prefix: string, input: CustomIconSetUpdateInput) {
      const updated = await repository.updateSet(prefix, input)

      if (!updated) {
        throw new CustomIconSetNotFoundError()
      }

      return mapCustomIconSet(updated)
    },

    async delete(prefix: string) {
      const deleted = await repository.softDeleteSet(prefix)

      if (!deleted) {
        throw new CustomIconSetNotFoundError()
      }
    },

    async listIcons(query: IconSetIconListQuery) {
      const result = await repository.listIcons(query)

      return {
        ...result,
        list: result.list.map(mapCustomIcon),
      }
    },

    async uploadIcons(
      prefix: string,
      input: CustomIconUploadInput,
    ): Promise<CustomIconUploadResponse> {
      const set = await getSetOrThrow(prefix)
      const created: CustomIconUploadResponse['created'] = []
      const replaced: CustomIconUploadResponse['replaced'] = []
      const skipped: CustomIconUploadResponse['skipped'] = []
      const failed: CustomIconUploadFailed[] = []

      for (const file of input.files) {
        let parsed: Awaited<ReturnType<typeof parseSvgIcon>> | undefined

        try {
          parsed = await parseSvgIcon(file.filename, file.content)
          const existing = await repository.findIcon(set.id, parsed.name)

          if (existing && input.duplicateStrategy === 'skip') {
            skipped.push({
              name: parsed.name,
              sourceFilename: file.filename,
              reason: 'duplicate',
            })
            continue
          }

          if (existing) {
            const updated = await repository.replaceIcon(existing.id, parsed)

            if (!updated) {
              throw new CustomIconNotFoundError()
            }

            replaced.push(mapCustomIcon(updated))
            continue
          }

          created.push(mapCustomIcon(await repository.createIcon(set, parsed)))
        } catch (error) {
          if (parsed && error instanceof CustomIconConflictError) {
            const existing = await repository.findIcon(set.id, parsed.name)

            if (input.duplicateStrategy === 'skip') {
              skipped.push({
                name: parsed.name,
                sourceFilename: file.filename,
                reason: 'duplicate',
              })
              continue
            }

            if (existing) {
              const updated = await repository.replaceIcon(existing.id, parsed)

              if (updated) {
                replaced.push(mapCustomIcon(updated))
                continue
              }
            }

            failed.push({
              sourceFilename: file.filename,
              message: error.message,
            })
            continue
          }

          if (error instanceof CustomSvgInvalidError) {
            failed.push({
              sourceFilename: file.filename,
              message: error.message,
            })
            continue
          }

          throw error
        }
      }

      return {
        created,
        replaced,
        skipped,
        failed,
      }
    },

    async renameIcon(prefix: string, oldName: string, input: IconSetRenameIconInput) {
      const set = await getSetOrThrow(prefix)

      if (input.name !== oldName && (await repository.findIcon(set.id, input.name))) {
        throw new CustomIconConflictError()
      }

      const renamed = await repository.renameIcon(prefix, oldName, input)

      if (!renamed) {
        throw new CustomIconNotFoundError()
      }

      return mapCustomIcon(renamed)
    },

    async deleteIcon(prefix: string, name: string) {
      await getSetOrThrow(prefix)
      const deleted = await repository.softDeleteIcon(prefix, name)

      if (!deleted) {
        throw new CustomIconNotFoundError()
      }
    },

    async exportIconSet(prefix: string) {
      const set = await getSetOrThrow(prefix)
      const icons = await repository.listAllIconsForExport(prefix)

      return exportCustomIconSet(set, icons)
    },
  }
}
