import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build, normalizePath, type Plugin } from 'vite'
import { describe, expect, it } from 'vitest'

interface BuildGraph {
  loaded: Set<string>
  bundled: Set<string>
}

interface BuildGraphOptions {
  virtualSource: string
  vue?: boolean
}

const packageRoot = normalizePath(fileURLToPath(new URL('../../', import.meta.url)))
const sourceRoot = normalizePath(fileURLToPath(new URL('../../src/', import.meta.url)))
const virtualEntryId = 'virtual:rich-text-minimal'
const resolvedVirtualEntryId = '\0rich-text-minimal'

function normalizeModuleId(id: string) {
  return normalizePath(id).replace(/\?.*$/, '')
}

function createVirtualEntry(source: string): Plugin {
  return {
    name: 'rich-text-test-virtual-entry',
    resolveId(id) {
      if (id.endsWith(virtualEntryId)) {
        return resolvedVirtualEntryId
      }
    },
    load(id) {
      if (id === resolvedVirtualEntryId) {
        return source
      }
    },
  }
}

async function collectBuildGraph(options: BuildGraphOptions): Promise<BuildGraph> {
  const loaded = new Set<string>()
  const collectModules: Plugin = {
    name: 'collect-rich-text-test-module-graph',
    generateBundle() {
      for (const id of this.getModuleIds()) {
        loaded.add(normalizeModuleId(id))
      }
    },
  }

  const result = await build({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [
      ...(options.vue ? [vue()] : []),
      createVirtualEntry(options.virtualSource),
      collectModules,
    ],
    build: {
      write: false,
      minify: false,
      rolldownOptions: {
        input: virtualEntryId,
        output: { format: 'es' },
      },
    },
  })

  const bundled = new Set<string>()
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!('output' in output)) {
      throw new Error('Unexpected Vite watch result while collecting the rich text build graph')
    }

    for (const item of output.output) {
      if (item.type !== 'chunk') {
        continue
      }

      for (const id of Object.keys(item.modules)) {
        bundled.add(normalizeModuleId(id))
      }
    }
  }

  return { loaded, bundled }
}

function findModules(ids: Iterable<string>, predicate: (id: string) => boolean) {
  return [...ids].filter(predicate).sort()
}

function isVueModule(id: string) {
  return (
    id.includes('/packages/rich-text/src/vue/') ||
    /\/packages\/rich-text\/src\/features\/[^/]+\/vue(?:\.ts|\/)/.test(id) ||
    id.endsWith('.vue') ||
    id.includes('/node_modules/vue/') ||
    id.includes('/node_modules/@vue/') ||
    id.includes('/node_modules/@vueuse/') ||
    id.includes('/node_modules/naive-ui/')
  )
}

function isEditorModule(id: string) {
  return (
    id.includes('/packages/rich-text/src/editor/') ||
    /\/packages\/rich-text\/src\/features\/[^/]+\/editor(?:\.ts|\/)/.test(id)
  )
}

function isServerModule(id: string) {
  return (
    id.includes('/packages/rich-text/src/server/') ||
    /\/packages\/rich-text\/src\/features\/[^/]+\/server(?:\.ts|\/)/.test(id) ||
    id.includes('/node_modules/sanitize-html/')
  )
}

function collectFeatureKeys(ids: Iterable<string>) {
  const featureKeys = new Set<string>()

  for (const id of ids) {
    const match = id.match(/\/packages\/rich-text\/src\/features\/([^/]+)\//)
    if (match?.[1]) {
      featureKeys.add(match[1])
    }
  }

  return [...featureKeys].sort()
}

describe('rich text import boundaries', () => {
  it('keeps Vue and editor runtime modules out of server entries', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
        export * from '@rev30/rich-text/server'
        export * from '@rev30/rich-text/server/presets/all'
        export * from '@rev30/rich-text/server/presets/compact'
      `,
    })
    const isForbidden = (id: string) => isVueModule(id) || isEditorModule(id)

    expect(
      findModules(
        graph.loaded,
        (id) =>
          id.endsWith('/packages/rich-text/src/server/index.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/all.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/compact.ts'),
      ),
      'resolved server package exports',
    ).toHaveLength(3)
    expect(findModules(graph.loaded, isForbidden), 'loaded server module graph').toEqual([])
    expect(findModules(graph.bundled, isForbidden), 'bundled server module graph').toEqual([])
  }, 30_000)

  it('keeps server runtime modules out of editor entries', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
        export * from '@rev30/rich-text/vue'
        export * from '@rev30/rich-text/vue/presets/all'
        export * from '@rev30/rich-text/vue/presets/compact'
      `,
      vue: true,
    })

    expect(
      findModules(
        graph.loaded,
        (id) =>
          id.endsWith('/packages/rich-text/src/vue/index.ts') ||
          id.endsWith('/packages/rich-text/src/vue/presets/all.ts') ||
          id.endsWith('/packages/rich-text/src/vue/presets/compact.ts'),
      ),
      'resolved Vue package exports',
    ).toHaveLength(3)
    expect(findModules(graph.loaded, isServerModule), 'loaded editor module graph').toEqual([])
    expect(findModules(graph.bundled, isServerModule), 'bundled editor module graph').toEqual([])
  }, 30_000)

  it('does not load all-only features through public compact preset entries', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
        export { compactRichTextPreset } from '@rev30/rich-text/presets/compact'
        export { compactRichTextServerPreset } from '@rev30/rich-text/server/presets/compact'
        export { compactRichTextEditorPreset } from '@rev30/rich-text/vue/presets/compact'
      `,
      vue: true,
    })
    const compactFeatureKeys = ['base', 'bold', 'heading', 'history', 'italic', 'link', 'list']

    expect(
      findModules(
        graph.loaded,
        (id) =>
          id.endsWith('/packages/rich-text/src/presets/compact.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/compact.ts') ||
          id.endsWith('/packages/rich-text/src/vue/presets/compact.ts'),
      ),
      'resolved compact preset package exports',
    ).toHaveLength(3)
    expect(collectFeatureKeys(graph.loaded), 'loaded compact preset features').toEqual(
      compactFeatureKeys,
    )
    expect(collectFeatureKeys(graph.bundled), 'bundled compact preset features').toEqual(
      compactFeatureKeys,
    )
  }, 30_000)

  it('does not load unselected features for a minimal preset', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
          import { defineRichTextPreset } from ${JSON.stringify(`${sourceRoot}/core/preset.ts`)}
          import { baseEditorFeature } from ${JSON.stringify(`${sourceRoot}/features/base/editor.ts`)}
          import { baseServerFeature } from ${JSON.stringify(`${sourceRoot}/features/base/server.ts`)}
          import { baseFeature } from ${JSON.stringify(`${sourceRoot}/features/base/shared.ts`)}
          import { boldEditorFeature } from ${JSON.stringify(`${sourceRoot}/features/bold/editor.ts`)}
          import { boldServerFeature } from ${JSON.stringify(`${sourceRoot}/features/bold/server.ts`)}
          import { boldFeature } from ${JSON.stringify(`${sourceRoot}/features/bold/shared.ts`)}
          import { defineRichTextServerPreset } from ${JSON.stringify(`${sourceRoot}/server/presets/types.ts`)}
          import { defineRichTextEditorPreset } from ${JSON.stringify(`${sourceRoot}/vue/presets/types.ts`)}

          export const minimalPreset = defineRichTextPreset({
            key: 'minimal',
            features: [baseFeature, boldFeature],
          })
          export const minimalEditorPreset = defineRichTextEditorPreset(minimalPreset, {
            editorFeatures: [baseEditorFeature, boldEditorFeature],
          })
          export const minimalServerPreset = defineRichTextServerPreset(minimalPreset, [
            baseServerFeature,
            boldServerFeature,
          ])
        `,
    })

    expect(collectFeatureKeys(graph.loaded), 'loaded minimal preset features').toEqual([
      'base',
      'bold',
    ])
    expect(collectFeatureKeys(graph.bundled), 'bundled minimal preset features').toEqual([
      'base',
      'bold',
    ])
  }, 30_000)
})
