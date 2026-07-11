import { Extension } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import {
  defineRichTextFeature,
  validateRichTextFeatureImplementations,
  type RichTextFeature,
} from '../../src/core/feature'
import { collectRichTextDocumentExtensions, defineRichTextPreset } from '../../src/core/preset'
import { defineRichTextAction } from '../../src/editor/action'
import {
  collectRichTextEditorExtensions,
  defineRichTextEditorFeature,
} from '../../src/editor/feature'
import { defineRichTextServerFeature } from '../../src/server/feature'
import { defineRichTextServerPreset } from '../../src/server/presets/types'
import {
  defineRichTextToolbar,
  defineRichTextToolbarItem,
  richTextToolbarButton,
  richTextToolbarDropdown,
} from '../../src/vue/toolbar'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'

describe('rich text feature model', () => {
  it('rejects duplicate feature keys', () => {
    const firstFeature = defineRichTextFeature({
      key: 'duplicate',
      editorImplementation: false,
      serverImplementation: false,
    })
    const secondFeature = defineRichTextFeature({
      key: 'duplicate',
      editorImplementation: false,
      serverImplementation: false,
    })

    expect(() =>
      defineRichTextPreset({
        key: 'duplicate-test',
        features: [firstFeature, secondFeature],
      }),
    ).toThrow('Rich text preset "duplicate-test" has a duplicate feature: "duplicate"')
  })

  it('rejects missing feature dependencies', () => {
    const dependencyFeature = defineRichTextFeature({
      key: 'dependency',
      editorImplementation: false,
      serverImplementation: false,
    })
    const dependentFeature = defineRichTextFeature({
      key: 'dependent',
      editorImplementation: false,
      serverImplementation: false,
      dependencies: [dependencyFeature],
    })

    expect(() =>
      defineRichTextPreset({
        key: 'dependency-test',
        features: [dependentFeature],
      }),
    ).toThrow(
      'Rich text preset "dependency-test" is missing dependency "dependency" for feature "dependent"',
    )
  })

  it('rejects dependency cycles', () => {
    const firstDependencies: RichTextFeature[] = []
    const secondDependencies: RichTextFeature[] = []
    const firstFeature: RichTextFeature<'first'> = {
      key: 'first',
      editorImplementation: false,
      serverImplementation: false,
      dependencies: firstDependencies,
    }
    const secondFeature: RichTextFeature<'second'> = {
      key: 'second',
      editorImplementation: false,
      serverImplementation: false,
      dependencies: secondDependencies,
    }

    firstDependencies.push(secondFeature)
    secondDependencies.push(firstFeature)

    expect(() =>
      defineRichTextPreset({
        key: 'cycle-test',
        features: [firstFeature, secondFeature],
      }),
    ).toThrow('Rich text preset "cycle-test" has a dependency cycle at feature "first"')
  })

  it('requires exactly one implementation for each declared runtime implementation', () => {
    const editorFeature = defineRichTextFeature({
      key: 'editor-feature',
      editorImplementation: true,
      serverImplementation: false,
    })
    const serverFeature = defineRichTextFeature({
      key: 'server-feature',
      editorImplementation: false,
      serverImplementation: true,
    })
    const preset = defineRichTextPreset({
      key: 'runtime-test',
      features: [editorFeature, serverFeature],
    })
    const editorImplementation = defineRichTextEditorFeature(editorFeature, {})
    const serverImplementation = defineRichTextServerFeature(serverFeature, {
      allowedTags: ['server-feature'],
    })

    expect(() => defineRichTextEditorPreset(preset, { editorFeatures: [] })).toThrow(
      'Rich text preset "runtime-test" is missing the editor feature implementation: "editor-feature"',
    )
    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [editorImplementation, editorImplementation],
      }),
    ).toThrow(
      'Rich text preset "runtime-test" has duplicate editor feature implementations: "editor-feature"',
    )

    expect(() => defineRichTextServerPreset(preset, [serverImplementation])).not.toThrow()
    expect(() => defineRichTextServerPreset(preset, [])).toThrow(
      'Rich text preset "runtime-test" is missing the server feature implementation: "server-feature"',
    )
    expect(() =>
      defineRichTextServerPreset(preset, [serverImplementation, serverImplementation]),
    ).toThrow(
      'Rich text preset "runtime-test" has duplicate server feature implementations: "server-feature"',
    )
  })

  it('rejects implementations outside the canonical preset identity', () => {
    const canonicalFeature = defineRichTextFeature({
      key: 'identity',
      editorImplementation: true,
      serverImplementation: false,
    })
    const lookalikeFeature = defineRichTextFeature({
      key: 'identity',
      editorImplementation: true,
      serverImplementation: false,
    })
    const preset = defineRichTextPreset({
      key: 'identity-test',
      features: [canonicalFeature],
    })
    const lookalikeImplementation = defineRichTextEditorFeature(lookalikeFeature, {})

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [lookalikeImplementation],
      }),
    ).toThrow(
      'Rich text preset "identity-test" has an unknown editor feature implementation: "identity"',
    )
  })

  it('rejects implementations that were not declared by the feature', () => {
    const serverOnlyFeature = defineRichTextFeature({
      key: 'server-only',
      editorImplementation: false,
      serverImplementation: true,
    })
    const editorOnlyFeature = defineRichTextFeature({
      key: 'editor-only',
      editorImplementation: true,
      serverImplementation: false,
    })
    const preset = defineRichTextPreset({
      key: 'unsupported-runtime-test',
      features: [serverOnlyFeature],
    })

    expect(() =>
      validateRichTextFeatureImplementations(preset, 'editor', [{ feature: serverOnlyFeature }]),
    ).toThrow(
      'Rich text feature "server-only" does not declare the editor implementation in preset "unsupported-runtime-test"',
    )
    expect(() => defineRichTextEditorFeature(serverOnlyFeature, {})).toThrow(
      'Rich text feature "server-only" does not declare the editor implementation',
    )
    expect(() => defineRichTextServerFeature(editorOnlyFeature, {})).toThrow(
      'Rich text feature "editor-only" does not declare the server implementation',
    )
  })

  it('rejects actions bound to another feature or using a duplicate key', () => {
    const firstFeature = defineRichTextFeature({
      key: 'first-action-feature',
      editorImplementation: true,
      serverImplementation: false,
    })
    const secondFeature = defineRichTextFeature({
      key: 'second-action-feature',
      editorImplementation: true,
      serverImplementation: false,
    })
    const firstAction = defineRichTextAction(firstFeature, {
      key: 'toggle',
      run: () => true,
    })
    const duplicateAction = defineRichTextAction(firstFeature, {
      key: 'toggle',
      run: () => true,
    })
    const foreignAction = defineRichTextAction(secondFeature, {
      key: 'foreign',
      run: () => true,
    })

    expect(() =>
      defineRichTextEditorFeature(firstFeature, {
        actions: [
          // @ts-expect-error Deliberately verifies the runtime guard against foreign actions.
          foreignAction,
        ],
      }),
    ).toThrow('Rich text action "foreign" does not belong to feature "first-action-feature"')
    expect(() =>
      defineRichTextEditorFeature(firstFeature, {
        actions: [firstAction, duplicateAction],
      }),
    ).toThrow('Rich text feature "first-action-feature" has a duplicate action: "toggle"')
  })

  it('validates toolbar feature and action registration', () => {
    const feature = defineRichTextFeature({
      key: 'toolbar-feature',
      editorImplementation: true,
      serverImplementation: false,
    })
    const otherFeature = defineRichTextFeature({
      key: 'other-toolbar-feature',
      editorImplementation: true,
      serverImplementation: false,
    })
    const registeredAction = defineRichTextAction(feature, {
      key: 'registered',
      run: () => true,
    })
    const unregisteredAction = defineRichTextAction(feature, {
      key: 'unregistered',
      run: () => true,
    })
    const otherAction = defineRichTextAction(otherFeature, {
      key: 'other',
      run: () => true,
    })
    const preset = defineRichTextPreset({ key: 'toolbar-test', features: [feature] })
    const editorFeature = defineRichTextEditorFeature(feature, {
      actions: [registeredAction],
    })

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [editorFeature],
        toolbar: defineRichTextToolbar([
          {
            key: 'test',
            controls: [
              richTextToolbarButton(
                defineRichTextToolbarItem(unregisteredAction, {
                  label: '未注册',
                  icon: 'i-[lucide--circle]',
                }),
              ),
            ],
          },
        ]),
      }),
    ).toThrow(
      'Rich text toolbar action "unregistered" is not registered by feature "toolbar-feature"',
    )

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [editorFeature],
        toolbar: defineRichTextToolbar([
          {
            key: 'test',
            controls: [
              richTextToolbarButton(
                defineRichTextToolbarItem(otherAction, {
                  label: '其它',
                  icon: 'i-[lucide--circle]',
                }),
              ),
            ],
          },
        ]),
      }),
    ).toThrow(
      'Rich text preset "toolbar-test" has a toolbar control for unknown feature "other-toolbar-feature"',
    )
  })

  it('rejects empty dropdowns and dropdowns that mix features', () => {
    const firstFeature = defineRichTextFeature({
      key: 'first-dropdown-feature',
      editorImplementation: true,
      serverImplementation: false,
    })
    const secondFeature = defineRichTextFeature({
      key: 'second-dropdown-feature',
      editorImplementation: true,
      serverImplementation: false,
    })
    const firstItem = defineRichTextToolbarItem(
      defineRichTextAction(firstFeature, { key: 'first', run: () => true }),
      { label: '第一项', icon: 'i-[lucide--circle]' },
    )
    const secondItem = defineRichTextToolbarItem(
      defineRichTextAction(secondFeature, { key: 'second', run: () => true }),
      { label: '第二项', icon: 'i-[lucide--circle]' },
    )

    expect(() =>
      richTextToolbarDropdown({
        key: 'empty',
        label: '空',
        icon: 'i-[lucide--circle]',
        items: [],
      }),
    ).toThrow('Rich text toolbar dropdown "empty" must contain at least one item')
    expect(() =>
      richTextToolbarDropdown({
        key: 'mixed',
        label: '混合',
        icon: 'i-[lucide--circle]',
        items: [firstItem, secondItem],
      }),
    ).toThrow('Rich text toolbar dropdown "mixed" mixes multiple features')
  })

  it('collects shared and editor extensions in canonical feature order', () => {
    const firstDocumentExtension = Extension.create({ name: 'first-document' })
    const firstEditorExtension = Extension.create({ name: 'first-editor' })
    const secondDocumentExtension = Extension.create({ name: 'second-document' })
    const firstFeature = defineRichTextFeature({
      key: 'first',
      editorImplementation: true,
      serverImplementation: true,
      documentExtensions: () => [firstDocumentExtension],
    })
    const secondFeature = defineRichTextFeature({
      key: 'second',
      editorImplementation: false,
      serverImplementation: true,
      documentExtensions: () => [secondDocumentExtension],
    })
    const preset = defineRichTextPreset({
      key: 'extension-test',
      features: [firstFeature, secondFeature],
    })
    const firstEditorFeature = defineRichTextEditorFeature(firstFeature, {
      extensions: () => [firstEditorExtension],
    })
    const editorPreset = defineRichTextEditorPreset(preset, {
      editorFeatures: [firstEditorFeature],
    })

    expect(collectRichTextDocumentExtensions(preset).map((extension) => extension.name)).toEqual([
      'first-document',
      'second-document',
    ])
    expect(
      collectRichTextEditorExtensions(editorPreset).map((extension) => extension.name),
    ).toEqual(['first-document', 'first-editor', 'second-document'])
  })

  it('snapshots and freezes server policies before they enter a cached preset', () => {
    const feature = defineRichTextFeature({
      key: 'policy',
      editorImplementation: false,
      serverImplementation: true,
    })
    const allowedTags = ['p']
    const allowedAttributes = { p: ['class'] }
    const allowedSchemesByTag = { img: ['data'] }
    const policy = { allowedTags, allowedAttributes, allowedSchemesByTag }
    const serverFeature = defineRichTextServerFeature(feature, policy)
    const preset = defineRichTextPreset({ key: 'policy-test', features: [feature] })
    const serverPreset = defineRichTextServerPreset(preset, [serverFeature])

    allowedTags.push('script')
    allowedAttributes.p.push('style')
    allowedSchemesByTag.img.push('javascript')

    expect(serverPreset.htmlPolicies[0]).toEqual({
      allowedTags: ['p'],
      allowedAttributes: { p: ['class'] },
      allowedSchemesByTag: { img: ['data'] },
    })
    expect(Object.isFrozen(serverFeature.htmlPolicy)).toBe(true)
    expect(Object.isFrozen(serverFeature.htmlPolicy.allowedTags)).toBe(true)
    expect(Object.isFrozen(serverFeature.htmlPolicy.allowedAttributes)).toBe(true)
    expect(Object.isFrozen(serverFeature.htmlPolicy.allowedAttributes?.p)).toBe(true)
    expect(Object.isFrozen(serverFeature.htmlPolicy.allowedSchemesByTag)).toBe(true)
    expect(Object.isFrozen(serverFeature.htmlPolicy.allowedSchemesByTag?.img)).toBe(true)
  })

  it('returns frozen copies for mutable definition arrays', () => {
    const dependencies: RichTextFeature[] = []
    const feature = defineRichTextFeature({
      key: 'frozen',
      editorImplementation: false,
      serverImplementation: false,
      dependencies,
    })
    const features = [feature]
    const preset = defineRichTextPreset({
      key: 'frozen-test',
      features,
    })

    expect(feature.dependencies).not.toBe(dependencies)
    expect(preset.features).not.toBe(features)
    expect(Object.isFrozen(feature)).toBe(true)
    expect(Object.isFrozen(feature.dependencies)).toBe(true)
    expect(Object.isFrozen(preset)).toBe(true)
    expect(Object.isFrozen(preset.features)).toBe(true)
    expect(Object.isFrozen(dependencies)).toBe(false)
    expect(Object.isFrozen(features)).toBe(false)
  })
})
