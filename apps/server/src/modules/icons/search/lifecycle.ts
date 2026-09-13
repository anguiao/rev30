import type { Logger } from 'pino'
import type { Db } from '../../../db'
import {
  getDefaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
  type BuiltinIconSearchDocument,
  type IconSearchRuntimeManifest,
} from './artifacts'
import { ICON_SEARCH_RULES_VERSION } from './text'
import { getCommittedIconSearchState, replaceBuiltinIconSearchDocuments } from './repository'
import { IconSearchPreparingError, IconSearchUnavailableError } from './errors'

export type IconSearchTargetManifest = {
  indexVersion: string
  iconPackageVersion: string
  searchDataVersion: string
  rulesVersion: string
}

type RuntimeState = { status: 'ready' | 'preparing' | 'failed'; compatible: boolean }
const runtimes = new WeakMap<object, RuntimeState>()

export function assertIconSearchAvailable(database: Db) {
  const runtime = runtimes.get(database as object)
  if (!runtime || runtime.compatible) return
  if (runtime.status === 'preparing') throw new IconSearchPreparingError()
  throw new IconSearchUnavailableError()
}

export async function prepareIconSearchIndex(
  database: Db,
  input: {
    manifest: IconSearchTargetManifest
    readDocuments: () => Promise<BuiltinIconSearchDocument[]>
  },
) {
  const committed = await getCommittedIconSearchState(database)
  if (committed?.indexVersion === input.manifest.indexVersion) {
    runtimes.set(database as object, { status: 'ready', compatible: true })
    return 'reused' as const
  }

  const compatible = Boolean(
    committed &&
    committed.iconPackageVersion === input.manifest.iconPackageVersion &&
    committed.rulesVersion === input.manifest.rulesVersion,
  )
  runtimes.set(database as object, { status: 'preparing', compatible })
  try {
    const documents = await input.readDocuments()
    await replaceBuiltinIconSearchDocuments(
      database,
      documents,
      input.manifest,
      !committed || committed.rulesVersion !== input.manifest.rulesVersion,
    )
    runtimes.set(database as object, { status: 'ready', compatible: true })
    return 'updated' as const
  } catch (error) {
    runtimes.set(database as object, { status: 'failed', compatible })
    throw error
  }
}

export function startDefaultIconSearchIndexPreparation(
  database: Db,
  input: {
    logger: Pick<Logger, 'error'>
    installedIconPackageVersion: string
    artifactDirectory?: string
    loadManifest?: () => Promise<IconSearchRuntimeManifest>
  },
) {
  const directory = input.artifactDirectory ?? getDefaultIconSearchArtifactDirectory()
  runtimes.set(database as object, { status: 'preparing', compatible: false })
  const completed = (async () => {
    let compatible = false
    try {
      const committed = await getCommittedIconSearchState(database)
      compatible = Boolean(
        committed &&
        committed.iconPackageVersion === input.installedIconPackageVersion &&
        committed.rulesVersion === ICON_SEARCH_RULES_VERSION,
      )
      runtimes.set(database as object, { status: 'preparing', compatible })
      const manifest = await (input.loadManifest?.() ?? readIconSearchManifest(directory))
      if (manifest.iconPackageVersion !== input.installedIconPackageVersion) {
        throw new Error('Icon search artifacts do not match the installed icon package')
      }
      if (manifest.rulesVersion !== ICON_SEARCH_RULES_VERSION) {
        throw new Error('Icon search artifacts use incompatible search rules')
      }
      await prepareIconSearchIndex(database, {
        manifest,
        readDocuments: async () => {
          const documents: BuiltinIconSearchDocument[] = []
          for await (const document of iterateIconSearchArtifacts(directory, manifest))
            documents.push(document)
          return documents
        },
      })
    } catch (error) {
      runtimes.set(database as object, { status: 'failed', compatible })
      input.logger.error(
        { errorMessage: error instanceof Error ? error.message : String(error) },
        'icon search index preparation failed',
      )
    }
  })()
  return { completed }
}
