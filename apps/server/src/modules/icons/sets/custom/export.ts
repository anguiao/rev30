import type { IconifyJSON } from '@iconify/types'
import type { CustomIconItem } from '@rev30/contracts'

export function exportCustomIconSet(prefix: string, icons: CustomIconItem[]): IconifyJSON {
  return {
    prefix,
    icons: Object.fromEntries(
      icons.map((icon) => [
        icon.name,
        {
          body: icon.body,
          width: icon.width,
          height: icon.height,
        },
      ]),
    ),
    aliases: {},
  }
}
