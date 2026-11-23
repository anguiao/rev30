import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IconSearchUnavailableError } from '../errors'
import { defaultIconSearchArtifactDirectory } from './artifacts/reader'
import { loadIconSearchConcepts, type IconSearchConceptDictionary } from './concepts'

// tsup supplies the dictionary subdirectory relative to the published search artifacts.
declare const __PACKAGED_ICON_SEARCH_CONCEPTS_DIR__: string
const defaultConceptsDirectory =
  typeof __PACKAGED_ICON_SEARCH_CONCEPTS_DIR__ === 'string'
    ? join(defaultIconSearchArtifactDirectory, __PACKAGED_ICON_SEARCH_CONCEPTS_DIR__)
    : fileURLToPath(new URL('../../../../resources/icon-search/concepts', import.meta.url))

type ConceptStartup = { dictionary?: IconSearchConceptDictionary }
let activeStartup: ConceptStartup = {}

export async function initializeRuntimeIconSearchConcepts(directory = defaultConceptsDirectory) {
  const startup: ConceptStartup = {}
  activeStartup = startup
  startup.dictionary = await loadIconSearchConcepts(directory)
}

export function getRuntimeIconSearchConcepts(): IconSearchConceptDictionary {
  if (!activeStartup.dictionary) throw new IconSearchUnavailableError()
  return activeStartup.dictionary
}
