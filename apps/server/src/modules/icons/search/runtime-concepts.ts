import { fileURLToPath } from 'node:url'
import { IconSearchUnavailableError } from '../errors'
import { loadIconSearchConcepts, type IconSearchConceptDictionary } from './concepts'

type ConceptStartup = { dictionary?: IconSearchConceptDictionary }
let activeStartup: ConceptStartup = {}

export async function initializeRuntimeIconSearchConcepts(moduleUrl = import.meta.url) {
  const startup: ConceptStartup = {}
  activeStartup = startup
  // The production build bundles this module into dist/index.js.
  const relativeDirectory = moduleUrl.endsWith('/dist/index.js')
    ? './icon-search/concepts'
    : '../../../../resources/icon-search/concepts'
  startup.dictionary = await loadIconSearchConcepts(
    fileURLToPath(new URL(relativeDirectory, moduleUrl)),
  )
}

export function getRuntimeIconSearchConcepts(): IconSearchConceptDictionary {
  if (!activeStartup.dictionary) throw new IconSearchUnavailableError()
  return activeStartup.dictionary
}
