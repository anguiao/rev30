import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build, normalizePath, type Plugin } from 'vite'
import { describe, expect, it } from 'vitest'

interface BuildGraph {
  loaded: Set<string>
  bundled: Set<string>
  css: string
}

interface BuildGraphOptions {
  virtualSource: string
  vue?: boolean
}

const packageRoot = normalizePath(fileURLToPath(new URL('../../', import.meta.url)))
const sourceRoot = normalizePath(fileURLToPath(new URL('../../src/', import.meta.url))).replace(
  /\/$/,
  '',
)
const virtualEntryId = 'virtual:rich-text-minimal'
const resolvedVirtualEntryId = '\0rich-text-minimal'

const packageClientEditorEntryPaths = ['action', 'feature', 'interaction', 'paste'].map(
  (moduleName) => `${sourceRoot}/client/editor/${moduleName}.ts`,
)
const featureClientEditorEntryPaths = readdirSync(`${sourceRoot}/features`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `${sourceRoot}/features/${entry.name}/client/editor.ts`)
  .filter((entryPath) => existsSync(entryPath))
const headlessEditorEntryPaths = [
  ...packageClientEditorEntryPaths,
  ...featureClientEditorEntryPaths,
]

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
  const css: string[] = []
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!('output' in output)) {
      throw new Error('Unexpected Vite watch result while collecting the rich text build graph')
    }

    for (const item of output.output) {
      if (item.type === 'asset') {
        if (item.fileName.endsWith('.css')) {
          css.push(
            typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source),
          )
        }
        continue
      }

      for (const id of Object.keys(item.modules)) {
        bundled.add(normalizeModuleId(id))
      }
    }
  }

  return { loaded, bundled, css: css.join('\n') }
}

function findModules(ids: Iterable<string>, predicate: (id: string) => boolean) {
  return [...ids].filter(predicate).sort()
}

function isVueModule(id: string) {
  return (
    id.includes('/packages/rich-text/src/client/vue/') ||
    /\/packages\/rich-text\/src\/features\/[^/]+\/client\/vue(?:\.ts|\/)/.test(id) ||
    id.endsWith('.vue') ||
    id.includes('/node_modules/vue/') ||
    id.includes('/node_modules/@vue/') ||
    id.includes('/node_modules/@vueuse/') ||
    id.includes('/node_modules/@tiptap/vue-3/') ||
    id.includes('/node_modules/naive-ui/')
  )
}

function isEditorModule(id: string) {
  return (
    id.includes('/packages/rich-text/src/client/editor/') ||
    /\/packages\/rich-text\/src\/features\/[^/]+\/client\/editor(?:\.ts|\/)/.test(id)
  )
}

function isCssModule(id: string) {
  return id.endsWith('.css')
}

function isCodeBlockHighlighterModule(id: string) {
  return (
    id.includes('/node_modules/@tiptap/extension-code-block-lowlight/') ||
    id.includes('/node_modules/highlight.js/') ||
    id.includes('/node_modules/lowlight/')
  )
}

function isUnusedTextStyleModule(id: string) {
  return (
    id.includes('/node_modules/@tiptap/extension-text-style/dist/background-color/') ||
    id.includes('/node_modules/@tiptap/extension-text-style/dist/text-style-kit/') ||
    id.endsWith('/node_modules/@tiptap/extension-text-style/dist/index.js')
  )
}

function isTextStyleModule(id: string) {
  return id.includes('/node_modules/@tiptap/extension-text-style/')
}

function isCharacterCountModule(id: string) {
  return id.includes('/node_modules/@tiptap/extensions/dist/character-count/')
}

function isSearchReplaceModule(id: string) {
  return id.includes('/packages/rich-text/src/features/search-replace/')
}

function isServerModule(id: string) {
  return (
    id.includes('/packages/rich-text/src/server/') ||
    /\/packages\/rich-text\/src\/features\/[^/]+\/server\//.test(id) ||
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
  it('keeps Vue and editor-only modules out of server entries', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
        export * from '@rev30/rich-text/server'
        export * from '@rev30/rich-text/server/presets/all'
        export * from '@rev30/rich-text/server/presets/compact'
        export * from '@rev30/rich-text/server/presets/standard'
      `,
    })
    const isForbidden = (id: string) =>
      isVueModule(id) ||
      isEditorModule(id) ||
      isCodeBlockHighlighterModule(id) ||
      isUnusedTextStyleModule(id) ||
      isCharacterCountModule(id)

    expect(
      findModules(
        graph.loaded,
        (id) =>
          id.endsWith('/packages/rich-text/src/server/index.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/all.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/compact.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/standard.ts'),
      ),
      'resolved server package exports',
    ).toHaveLength(4)
    expect(findModules(graph.loaded, isForbidden), 'loaded server module graph').toEqual([])
    expect(findModules(graph.bundled, isForbidden), 'bundled server module graph').toEqual([])
    expect(graph.css, 'bundled server styles').toBe('')
  }, 30_000)

  it('keeps Vue, editor, server modules, and CSS out of the core standard entry', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `export * from '@rev30/rich-text/presets/standard'`,
    })

    expect(
      findModules(graph.loaded, (id) =>
        id.endsWith('/packages/rich-text/src/core/presets/standard.ts'),
      ),
      'resolved core standard package export',
    ).toHaveLength(1)
    expect(findModules(graph.loaded, isVueModule), 'loaded core Vue module graph').toEqual([])
    expect(findModules(graph.loaded, isEditorModule), 'loaded core editor module graph').toEqual([])
    expect(findModules(graph.loaded, isServerModule), 'loaded core server module graph').toEqual([])
    expect(graph.css, 'bundled core standard styles').toBe('')
  }, 30_000)

  it('exposes independently loadable content CSS preset entries', async () => {
    const all = await collectBuildGraph({
      virtualSource: `import '@rev30/rich-text/content/presets/all.css'`,
    })
    const compact = await collectBuildGraph({
      virtualSource: `import '@rev30/rich-text/content/presets/compact.css'`,
    })
    const standard = await collectBuildGraph({
      virtualSource: `import '@rev30/rich-text/content/presets/standard.css'`,
    })

    expect(all.css, 'bundled all content styles').toContain('.rich-text-content')
    expect(all.css, 'bundled all table styles').toContain('.tableWrapper')
    expect(compact.css, 'bundled compact content styles').toContain('.rich-text-content')
    expect(compact.css, 'bundled compact heading styles').toContain('h1')
    expect(standard.css, 'bundled standard content styles').toContain('.rich-text-content')
    expect(standard.css, 'bundled standard heading styles').toContain('h1')
    expect(standard.css, 'bundled standard image styles').toContain(':where(img)')
    expect(standard.css, 'bundled standard table styles').not.toContain('.tableWrapper')
    expect(standard.css, 'bundled standard code block styles').not.toContain(':where(pre)')
    expect(standard.css, 'bundled standard inline code styles').not.toContain(':where(code)')
  }, 30_000)

  it('loads content CSS from Vue preset entries', async () => {
    const all = await collectBuildGraph({
      virtualSource: `export * from '@rev30/rich-text/vue/presets/all'`,
      vue: true,
    })
    const compact = await collectBuildGraph({
      virtualSource: `export * from '@rev30/rich-text/vue/presets/compact'`,
      vue: true,
    })
    const standard = await collectBuildGraph({
      virtualSource: `export * from '@rev30/rich-text/vue/presets/standard'`,
      vue: true,
    })

    expect(all.css, 'bundled all Vue preset content styles').toContain('.rich-text-content')
    expect(all.css, 'bundled all Vue preset table styles').toContain('.tableWrapper')
    expect(compact.css, 'bundled compact Vue preset content styles').toContain('.rich-text-content')
    expect(standard.css, 'bundled standard Vue preset content styles').toContain(
      '.rich-text-content',
    )
    expect(standard.css, 'bundled standard Vue preset table styles').not.toContain('.tableWrapper')
    expect(standard.css, 'bundled standard Vue preset code block styles').not.toContain(
      ':where(pre)',
    )
  }, 30_000)

  it('keeps server-only modules out of editor entries', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
        export * from '@rev30/rich-text/vue'
        export * from '@rev30/rich-text/vue/presets/all'
        export * from '@rev30/rich-text/vue/presets/compact'
        export * from '@rev30/rich-text/vue/presets/standard'
      `,
      vue: true,
    })

    expect(
      findModules(
        graph.loaded,
        (id) =>
          id.endsWith('/packages/rich-text/src/client/vue/index.ts') ||
          id.endsWith('/packages/rich-text/src/client/vue/presets/all.ts') ||
          id.endsWith('/packages/rich-text/src/client/vue/presets/compact.ts') ||
          id.endsWith('/packages/rich-text/src/client/vue/presets/standard.ts'),
      ),
      'resolved Vue package exports',
    ).toHaveLength(4)
    expect(findModules(graph.loaded, isServerModule), 'loaded editor module graph').toEqual([])
    expect(findModules(graph.bundled, isServerModule), 'bundled editor module graph').toEqual([])
    expect(findModules(graph.loaded, isUnusedTextStyleModule), 'loaded text style modules').toEqual(
      [],
    )
    expect(
      findModules(graph.bundled, isUnusedTextStyleModule),
      'bundled text style modules',
    ).toEqual([])
    expect(graph.css, 'bundled all search match styles').toContain('.rich-text-search-match {')
    expect(graph.css, 'bundled all current search match styles').toContain(
      'rich-text-search-match-current',
    )
  }, 30_000)

  it('keeps the internal headless editor graph free of Vue, server, and CSS modules', async () => {
    const bindings = headlessEditorEntryPaths
      .map((entryPath, index) => `import * as entry${index} from ${JSON.stringify(entryPath)}`)
      .join('\n')
    const entries = headlessEditorEntryPaths.map((_, index) => `entry${index}`).join(', ')
    const graph = await collectBuildGraph({
      virtualSource: `${bindings}\nexport const headlessEditorEntries = [${entries}]`,
    })

    expect(
      findModules(graph.loaded, (id) => headlessEditorEntryPaths.includes(id)),
      'resolved package and feature headless editor entries',
    ).toHaveLength(headlessEditorEntryPaths.length)
    expect(findModules(graph.loaded, isVueModule), 'loaded headless editor Vue modules').toEqual([])
    expect(findModules(graph.bundled, isVueModule), 'bundled headless editor Vue modules').toEqual(
      [],
    )
    expect(
      findModules(graph.loaded, isServerModule),
      'loaded headless editor server modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isServerModule),
      'bundled headless editor server modules',
    ).toEqual([])
    expect(findModules(graph.loaded, isCssModule), 'loaded headless editor CSS modules').toEqual([])
    expect(findModules(graph.bundled, isCssModule), 'bundled headless editor CSS modules').toEqual(
      [],
    )
    expect(graph.css, 'bundled headless editor styles').toBe('')
  }, 30_000)

  it('does not load all-only features through public compact preset entries', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
        import { RichTextEditor } from '@rev30/rich-text/vue'
        export { compactRichTextPreset } from '@rev30/rich-text/presets/compact'
        export { compactRichTextServerPreset } from '@rev30/rich-text/server/presets/compact'
        export { compactRichTextEditorPreset } from '@rev30/rich-text/vue/presets/compact'

        globalThis.__richTextEditorBoundaryTest = RichTextEditor
      `,
      vue: true,
    })
    const compactFeatureKeys = ['base', 'bold', 'heading', 'history', 'italic', 'link', 'list']

    expect(
      findModules(
        graph.loaded,
        (id) =>
          id.endsWith('/packages/rich-text/src/core/presets/compact.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/compact.ts') ||
          id.endsWith('/packages/rich-text/src/client/vue/presets/compact.ts'),
      ),
      'resolved compact preset package exports',
    ).toHaveLength(3)
    expect(
      findModules(graph.loaded, (id) =>
        id.endsWith('/packages/rich-text/src/client/vue/RichTextEditor.vue'),
      ),
      'resolved shared rich text editor',
    ).toHaveLength(1)
    expect(graph.css.length, 'bundled compact editor styles').toBeGreaterThan(0)
    expect(collectFeatureKeys(graph.loaded), 'loaded compact preset features').toEqual(
      compactFeatureKeys,
    )
    expect(collectFeatureKeys(graph.bundled), 'bundled compact preset features').toEqual(
      compactFeatureKeys,
    )
    expect(
      findModules(graph.loaded, isTextStyleModule),
      'loaded compact text style modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isTextStyleModule),
      'bundled compact text style modules',
    ).toEqual([])
    expect(
      findModules(graph.loaded, isCharacterCountModule),
      'loaded compact character count modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isCharacterCountModule),
      'bundled compact character count modules',
    ).toEqual([])
    expect(
      findModules(graph.loaded, isSearchReplaceModule),
      'loaded compact search replace modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isSearchReplaceModule),
      'bundled compact search replace modules',
    ).toEqual([])
    expect(graph.css, 'bundled compact search match styles').not.toContain(
      '.rich-text-search-match {',
    )
    expect(graph.css, 'bundled compact current search match styles').not.toContain(
      'rich-text-search-match-current',
    )
  }, 30_000)

  it('does not load unselected features through public standard preset entries', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
        import { RichTextEditor } from '@rev30/rich-text/vue'
        export { standardRichTextPreset } from '@rev30/rich-text/presets/standard'
        export { createStandardRichTextServerPreset } from '@rev30/rich-text/server/presets/standard'
        export { createStandardRichTextEditorPreset } from '@rev30/rich-text/vue/presets/standard'

        globalThis.__richTextEditorBoundaryTest = RichTextEditor
      `,
      vue: true,
    })
    const standardFeatureKeys = [
      'base',
      'blockquote',
      'bold',
      'character-count',
      'heading',
      'highlight',
      'history',
      'horizontal-rule',
      'image',
      'italic',
      'link',
      'list',
      'remove-format',
      'search-replace',
      'strike',
      'text-align',
      'underline',
    ]

    expect(
      findModules(
        graph.loaded,
        (id) =>
          id.endsWith('/packages/rich-text/src/core/presets/standard.ts') ||
          id.endsWith('/packages/rich-text/src/server/presets/standard.ts') ||
          id.endsWith('/packages/rich-text/src/client/vue/presets/standard.ts'),
      ),
      'resolved standard preset package exports',
    ).toHaveLength(3)
    expect(
      findModules(graph.loaded, (id) =>
        id.endsWith('/packages/rich-text/src/client/vue/RichTextEditor.vue'),
      ),
      'resolved shared rich text editor',
    ).toHaveLength(1)
    expect(graph.css.length, 'bundled standard editor styles').toBeGreaterThan(0)
    expect(collectFeatureKeys(graph.loaded), 'loaded standard preset features').toEqual(
      standardFeatureKeys,
    )
    expect(collectFeatureKeys(graph.bundled), 'bundled standard preset features').toEqual(
      standardFeatureKeys,
    )
    expect(
      findModules(graph.loaded, isTextStyleModule),
      'loaded standard text style modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isTextStyleModule),
      'bundled standard text style modules',
    ).toEqual([])
    expect(
      findModules(graph.loaded, isCodeBlockHighlighterModule),
      'loaded standard code block highlighter modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isCodeBlockHighlighterModule),
      'bundled standard code block highlighter modules',
    ).toEqual([])
  }, 30_000)

  it('does not load unselected features for a minimal preset', async () => {
    const graph = await collectBuildGraph({
      virtualSource: `
          import { defineRichTextPreset } from ${JSON.stringify(`${sourceRoot}/core/preset.ts`)}
          import { baseEditorFeature } from ${JSON.stringify(`${sourceRoot}/features/base/client/editor.ts`)}
          import { baseServerFeature } from ${JSON.stringify(`${sourceRoot}/features/base/server/feature.ts`)}
          import { baseFeature } from ${JSON.stringify(`${sourceRoot}/features/base/core/feature.ts`)}
          import { boldEditorFeature } from ${JSON.stringify(`${sourceRoot}/features/bold/client/editor.ts`)}
          import { boldServerFeature } from ${JSON.stringify(`${sourceRoot}/features/bold/server/feature.ts`)}
          import { boldFeature } from ${JSON.stringify(`${sourceRoot}/features/bold/core/feature.ts`)}
          import { defineRichTextServerPreset } from ${JSON.stringify(`${sourceRoot}/server/preset.ts`)}
          import { defineRichTextEditorPreset } from ${JSON.stringify(`${sourceRoot}/client/vue/preset.ts`)}

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
    expect(
      findModules(graph.loaded, isTextStyleModule),
      'loaded minimal text style modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isTextStyleModule),
      'bundled minimal text style modules',
    ).toEqual([])
    expect(
      findModules(graph.loaded, isCharacterCountModule),
      'loaded minimal character count modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isCharacterCountModule),
      'bundled minimal character count modules',
    ).toEqual([])
    expect(
      findModules(graph.loaded, isSearchReplaceModule),
      'loaded minimal search replace modules',
    ).toEqual([])
    expect(
      findModules(graph.bundled, isSearchReplaceModule),
      'bundled minimal search replace modules',
    ).toEqual([])
  }, 30_000)
})
