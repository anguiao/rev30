import type { Logger } from 'pino'
import type { Db } from '../../../../db'
import { ICON_PACKAGE_VERSION } from '../../builtin'
import {
  defaultIconSearchArtifactDirectory,
  iterateIconSearchArtifacts,
  readIconSearchManifest,
} from '../artifacts/reader'
import type { IconSearchArtifactDocument } from '../artifacts/schema'
import {
  getCommittedIconSearchState,
  setIconSearchStatus,
  type IconSearchStateInput,
} from './state'
import { replaceBuiltinIconSearchDocuments } from './rebuild'
import { ICON_SEARCH_RULES_VERSION } from '../rules'

type IconSearchArtifacts = {
  manifest: IconSearchStateInput
  documents: AsyncIterable<IconSearchArtifactDocument> | Iterable<IconSearchArtifactDocument>
}
type PreparationInput = {
  installedIconPackageVersion: string
  loadArtifacts: () => Promise<IconSearchArtifacts>
  onCleanupError?: (error: Error) => void
}

export async function prepareIconSearchIndex(database: Db, input: PreparationInput) {
  setIconSearchStatus('preparing')
  let compatible = false
  try {
    const committed = await getCommittedIconSearchState(database)
    compatible = Boolean(
      committed &&
      committed.iconPackageVersion === input.installedIconPackageVersion &&
      committed.rulesVersion === ICON_SEARCH_RULES_VERSION,
    )
    setIconSearchStatus(compatible ? 'ready' : 'preparing')
    const { manifest, documents } = await input.loadArtifacts()
    if (manifest.iconPackageVersion !== input.installedIconPackageVersion) {
      throw new Error('Icon search artifacts do not match the installed icon package')
    }
    if (manifest.rulesVersion !== ICON_SEARCH_RULES_VERSION) {
      throw new Error('Icon search artifacts use incompatible search rules')
    }
    if (committed?.indexVersion === manifest.indexVersion) {
      setIconSearchStatus('ready')
      return 'reused' as const
    }

    await replaceBuiltinIconSearchDocuments(database, documents, manifest, {
      rebuildCustom: !committed || committed.rulesVersion !== manifest.rulesVersion,
      onCleanupError: input.onCleanupError,
    })
    setIconSearchStatus('ready')
    return 'updated' as const
  } catch (error) {
    setIconSearchStatus(compatible ? 'ready' : 'failed')
    throw error
  }
}

export function startIconSearchIndexPreparation(database: Db, logger: Pick<Logger, 'error'>) {
  const directory = defaultIconSearchArtifactDirectory

  return prepareIconSearchIndex(database, {
    installedIconPackageVersion: ICON_PACKAGE_VERSION,
    loadArtifacts: async () => {
      const manifest = await readIconSearchManifest(directory)
      return {
        manifest,
        documents: iterateIconSearchArtifacts(directory, manifest),
      }
    },
    onCleanupError: (error) => {
      logger.error({ errorMessage: error.message }, 'icon search index cleanup failed')
    },
  }).catch((error: unknown) => {
    logger.error(
      { errorMessage: error instanceof Error ? error.message : String(error) },
      'icon search index preparation failed',
    )
  })
}
