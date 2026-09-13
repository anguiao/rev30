import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const serverDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..')
const sourceDirectory = join(serverDirectory, 'generated/icon-search')
const targetDirectory = join(serverDirectory, 'dist/icon-search')

await rm(targetDirectory, { force: true, recursive: true })
await cp(sourceDirectory, targetDirectory, { recursive: true })
