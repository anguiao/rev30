import { lookupCollection } from '@iconify/json'
import { getIconData } from '@iconify/utils'
import { expect, it } from 'vitest'
import { recommendedIcons } from '../../../../src/modules/icons/search/recommended'

it('keeps recommended icons loadable from the installed icon package', async () => {
  const iconSet = await lookupCollection('lucide')

  for (const icon of recommendedIcons) {
    expect(getIconData(iconSet, icon.name), icon.icon).not.toBeNull()
  }
})
