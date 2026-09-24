import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadMaintainedSearchData } from './maintenance'

const serverDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const maintained = await loadMaintainedSearchData(join(serverDirectory, 'resources/icon-search'))

console.log(
  JSON.stringify({
    iconPackageVersion: maintained.iconPackageVersion,
    searchDataVersion: maintained.dataVersion,
    translationRecords: maintained.translations.length,
  }),
)
