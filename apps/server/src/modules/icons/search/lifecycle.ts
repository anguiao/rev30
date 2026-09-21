import type { Logger } from 'pino'
import type { Db } from '../../../db'
import {
  getDefaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from './artifacts/reader'
import { type BuiltinIconSearchDocument, type IconSearchRuntimeManifest } from './artifacts/schema'
import { IconSearchPreparingError, IconSearchUnavailableError } from './errors'
import { getCommittedIconSearchState, type IconSearchStateInput } from './index-state'
import { replaceBuiltinIconSearchDocuments } from './rebuild'
import { ICON_SEARCH_RULES_VERSION } from './version'

type RuntimeState = { status: 'ready' | 'preparing' | 'failed'; compatible: boolean }
const runtimes = new WeakMap<Db, RuntimeState>()
type PreparationInput = {
  manifest: IconSearchStateInput
  readDocuments: () =>
    | AsyncIterable<BuiltinIconSearchDocument>
    | Promise<Iterable<BuiltinIconSearchDocument>>
  onCleanupError?: (error: Error) => void
}

export function assertIconSearchAvailable(database: Db) {
  const runtime = runtimes.get(database)
  if (!runtime || runtime.compatible) return
  if (runtime.status === 'preparing') throw new IconSearchPreparingError()
  throw new IconSearchUnavailableError()
}

export async function prepareIconSearchIndex(database: Db, input: PreparationInput) {
  const committed = await getCommittedIconSearchState(database)
  if (committed?.indexVersion === input.manifest.indexVersion) {
    runtimes.set(database, { status: 'ready', compatible: true })
    return 'reused' as const
  }

  const compatible = Boolean(
    committed &&
    committed.iconPackageVersion === input.manifest.iconPackageVersion &&
    committed.rulesVersion === input.manifest.rulesVersion,
  )
  runtimes.set(database, { status: 'preparing', compatible })
  try {
    const documents = await input.readDocuments()
    await replaceBuiltinIconSearchDocuments(
      database,
      documents,
      input.manifest,
      !committed || committed.rulesVersion !== input.manifest.rulesVersion,
    )
    runtimes.set(database, { status: 'ready', compatible: true })
    return 'updated' as const
  } catch (error) {
    const current = await getCommittedIconSearchState(database)
    if (current?.indexVersion === input.manifest.indexVersion) {
      input.onCleanupError?.(error instanceof Error ? error : new Error(String(error)))
      runtimes.set(database, { status: 'ready', compatible: true })
      return 'updated' as const
    }
    runtimes.set(database, { status: 'failed', compatible })
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
    readDocuments?: PreparationInput['readDocuments']
  },
) {
  const directory = input.artifactDirectory ?? getDefaultIconSearchArtifactDirectory()
  runtimes.set(database, { status: 'preparing', compatible: false })
  const completed = (async () => {
    let compatible = false
    try {
      const committed = await getCommittedIconSearchState(database)
      compatible = Boolean(
        committed &&
        committed.iconPackageVersion === input.installedIconPackageVersion &&
        committed.rulesVersion === ICON_SEARCH_RULES_VERSION,
      )
      runtimes.set(database, { status: 'preparing', compatible })
      const manifest = await (input.loadManifest?.() ?? readIconSearchManifest(directory))
      if (manifest.iconPackageVersion !== input.installedIconPackageVersion) {
        throw new Error('Icon search artifacts do not match the installed icon package')
      }
      if (manifest.rulesVersion !== ICON_SEARCH_RULES_VERSION) {
        throw new Error('Icon search artifacts use incompatible search rules')
      }
      await prepareIconSearchIndex(database, {
        manifest,
        onCleanupError: (error) => {
          input.logger.error({ errorMessage: error.message }, 'icon search index cleanup failed')
        },
        readDocuments:
          input.readDocuments ?? (() => iterateIconSearchArtifacts(directory, manifest)),
      })
    } catch (error) {
      runtimes.set(database, { status: 'failed', compatible })
      input.logger.error(
        { errorMessage: error instanceof Error ? error.message : String(error) },
        'icon search index preparation failed',
      )
    }
  })()
  return { completed }
}
