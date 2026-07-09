import type { IconifyJSON } from '@iconify/types'
import type { CustomIconEntry, CustomIconSetRow } from './mapper'

const sampleLimit = 6

function toLastModified(set: CustomIconSetRow, icons: CustomIconEntry[]) {
  const latest =
    icons.length > 0
      ? Math.max(...icons.map((icon) => icon.updatedAt.getTime()))
      : set.updatedAt.getTime()

  return Math.floor(latest / 1000)
}

export function exportCustomIconSet(set: CustomIconSetRow, icons: CustomIconEntry[]): IconifyJSON {
  return {
    prefix: set.prefix,
    info: {
      name: set.name,
      total: icons.length,
      author: {
        name: 'Rev30',
      },
      license: {
        title: 'Custom',
      },
      samples: icons.slice(0, sampleLimit).map((icon) => icon.name),
      palette: icons.some((icon) => icon.palette),
    },
    lastModified: toLastModified(set, icons),
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
