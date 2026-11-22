import { iconSearchResourcesDirectory, loadMaintainedSearchData } from './maintenance'
import { loadIconPackage } from './package-source'

const iconPackage = await loadIconPackage()
const maintained = await loadMaintainedSearchData(
  iconSearchResourcesDirectory,
  iconPackage.collections,
)

console.log(
  JSON.stringify({
    iconPackageVersion: iconPackage.version,
    conceptsVersion: maintained.conceptsVersion,
    conceptKeys: maintained.concepts.byKey.size,
    officialSnapshots: maintained.official.checksums.length,
  }),
)
