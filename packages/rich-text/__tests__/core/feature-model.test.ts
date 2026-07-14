import { Extension } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import {
  defineRichTextFeature,
  validateRichTextFeatureImplementations,
} from '../../src/core/feature'
import { defineRichTextPreset } from '../../src/core/preset'
import { defineRichTextAction } from '../../src/editor/action'
import {
  collectRichTextEditorExtensions,
  defineRichTextEditorFeature,
} from '../../src/editor/feature'
import {
  collectRichTextServerExtensions,
  defineRichTextServerFeature,
} from '../../src/server/feature'
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
      htmlPolicy: { allowedTags: ['server-feature'] },
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
    expect(() => defineRichTextServerFeature(editorOnlyFeature, { htmlPolicy: {} })).toThrow(
      'Rich text feature "editor-only" does not declare the server implementation',
    )
  })

  it('rejects toolbar controls for foreign features', () => {
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
    const otherAction = defineRichTextAction(otherFeature, {
      key: 'other',
      run: () => true,
    })
    const preset = defineRichTextPreset({ key: 'toolbar-test', features: [feature] })
    const editorFeature = defineRichTextEditorFeature(feature, {})

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

  it('collects runtime extensions in canonical feature order', () => {
    const firstDocumentExtension = Extension.create({ name: 'first-document' })
    const firstEditorExtension = Extension.create({ name: 'first-editor' })
    const firstServerExtension = Extension.create({ name: 'first-server' })
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
    const firstServerFeature = defineRichTextServerFeature(firstFeature, {
      htmlPolicy: {},
      extensions: () => [firstServerExtension],
    })
    const secondServerFeature = defineRichTextServerFeature(secondFeature, { htmlPolicy: {} })
    const serverPreset = defineRichTextServerPreset(preset, [
      firstServerFeature,
      secondServerFeature,
    ])

    expect(
      collectRichTextEditorExtensions(editorPreset).map((extension) => extension.name),
    ).toEqual(['first-document', 'first-editor', 'second-document'])
    expect(
      collectRichTextServerExtensions(serverPreset).map((extension) => extension.name),
    ).toEqual(['first-document', 'first-server', 'second-document'])
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
    const serverFeature = defineRichTextServerFeature(feature, { htmlPolicy: policy })
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
    const feature = defineRichTextFeature({
      key: 'frozen',
      editorImplementation: false,
      serverImplementation: false,
    })
    const features = [feature]
    const preset = defineRichTextPreset({
      key: 'frozen-test',
      features,
    })

    expect(preset.features).not.toBe(features)
    expect(Object.isFrozen(feature)).toBe(true)
    expect(Object.isFrozen(preset)).toBe(true)
    expect(Object.isFrozen(preset.features)).toBe(true)
    expect(Object.isFrozen(features)).toBe(false)
  })
})
