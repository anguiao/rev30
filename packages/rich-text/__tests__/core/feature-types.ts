import { expectTypeOf } from 'vitest'
import { defineRichTextFeature, type RichTextFeature } from '../../src/core/feature'
import { defineRichTextPreset } from '../../src/core/preset'
import { defineRichTextAction } from '../../src/editor/action'
import { defineRichTextEditorFeature } from '../../src/editor/feature'
import {
  createImageServerFeature,
  type RichTextImageServerOptions,
} from '../../src/features/image/server'
import { imageFeature } from '../../src/features/image/shared'
import { defineRichTextServerFeature } from '../../src/server/feature'
import {
  createCompactRichTextServerPreset,
  type CompactRichTextServerPresetOptions,
} from '../../src/server/presets'
import { defineRichTextServerPreset } from '../../src/server/presets/types'
import {
  createCompactRichTextEditorPreset,
  type CompactRichTextEditorPresetOptions,
} from '../../src/vue/presets'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'

const baseFeature = defineRichTextFeature({
  key: 'base',
  editorImplementation: true,
  serverImplementation: true,
})

const dependencies = [baseFeature]
const dependentFeature = defineRichTextFeature({
  key: 'dependent',
  editorImplementation: true,
  serverImplementation: false,
  dependencies,
})

expectTypeOf(dependentFeature.key).toEqualTypeOf<'dependent'>()
expectTypeOf(dependentFeature.dependencies).toEqualTypeOf<readonly RichTextFeature[]>()

// @ts-expect-error Defined feature dependencies are immutable.
dependentFeature.dependencies.push(baseFeature)

const action = defineRichTextAction(dependentFeature, {
  key: 'toggle-dependent',
  run: () => true,
})
const actions = [action]
const editorFeature = defineRichTextEditorFeature(dependentFeature, { actions })
const otherFeature = defineRichTextFeature({
  key: 'other',
  editorImplementation: true,
  serverImplementation: false,
})
const otherAction = defineRichTextAction(otherFeature, {
  key: 'toggle-other',
  run: () => true,
})

expectTypeOf(action.feature).toEqualTypeOf<typeof dependentFeature>()
expectTypeOf(action.key).toEqualTypeOf<'toggle-dependent'>()

// @ts-expect-error Defined editor feature actions are immutable.
editorFeature.actions.push(action)

// @ts-expect-error An action cannot be registered by a feature with another key.
defineRichTextEditorFeature(dependentFeature, { actions: [otherAction] })

const mutableFeatures = [baseFeature, dependentFeature]
const preset = defineRichTextPreset({
  key: 'typed-preset',
  features: mutableFeatures,
})

// @ts-expect-error Defined preset membership is immutable.
preset.features.push(baseFeature)

const editorFeatures = [defineRichTextEditorFeature(baseFeature, {}), editorFeature]
const editorPreset = defineRichTextEditorPreset(preset, { editorFeatures })

// @ts-expect-error Defined editor preset implementations are immutable.
editorPreset.editorFeatures.push(editorFeature)

const baseServerFeature = defineRichTextServerFeature(baseFeature, {})
const serverPreset = defineRichTextServerPreset(preset, [baseServerFeature])

// @ts-expect-error Defined server preset implementations are immutable.
serverPreset.serverFeatures.push(baseServerFeature)

expectTypeOf(createImageServerFeature).parameter(0).toEqualTypeOf<RichTextImageServerOptions>()

const imageServerFeature = createImageServerFeature({
  isAllowedSrc: () => true,
})

expectTypeOf(imageServerFeature.feature).toEqualTypeOf<typeof imageFeature>()
expectTypeOf(createCompactRichTextEditorPreset)
  .parameter(0)
  .toEqualTypeOf<CompactRichTextEditorPresetOptions>()
expectTypeOf(createCompactRichTextServerPreset)
  .parameter(0)
  .toEqualTypeOf<CompactRichTextServerPresetOptions>()
