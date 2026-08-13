import { PGlite } from '@electric-sql/pglite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { migratePGlite } from '../src/db/migrate'

declare module 'vitest' {
  export interface ProvidedContext {
    pgliteSnapshotPath: string
  }
}

async function writeMigratedPGliteSnapshot(snapshotPath: string) {
  const client = await PGlite.create()

  try {
    await migratePGlite(client)
    const snapshot = await client.dumpDataDir('none')
    await writeFile(snapshotPath, new Uint8Array(await snapshot.arrayBuffer()))
  } finally {
    await client.close()
  }
}

export default async function setup(project: TestProject) {
  const snapshotDirectory = await mkdtemp(join(tmpdir(), 'rev30-server-tests-'))
  const snapshotPath = join(snapshotDirectory, 'pglite.tar')

  try {
    await writeMigratedPGliteSnapshot(snapshotPath)
  } catch (error) {
    await rm(snapshotDirectory, { recursive: true })
    throw error
  }

  project.provide('pgliteSnapshotPath', snapshotPath)
  project.onTestsRerun(async () => {
    await writeMigratedPGliteSnapshot(snapshotPath)
  })

  return async () => {
    await rm(snapshotDirectory, { recursive: true })
  }
}
