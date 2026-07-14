import { expectTypeOf } from 'vitest'
import { defineRichTextFeature } from '../../src/core/feature'
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
  createAllRichTextServerPreset,
  type AllRichTextServerPresetOptions,
} from '../../src/server/presets/all'
import { compactRichTextServerPreset } from '../../src/server/presets/compact'
import { defineRichTextServerPreset } from '../../src/server/presets/types'
import {
  createAllRichTextEditorPreset,
  type AllRichTextEditorPresetOptions,
} from '../../src/vue/presets/all'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'

const baseFeature = defineRichTextFeature({
  key: 'base',
  editorImplementation: true,
  serverImplementation: true,
})

const dependentFeature = defineRichTextFeature({
  key: 'dependent',
  editorImplementation: true,
  serverImplementation: false,
})

expectTypeOf(dependentFeature.key).toEqualTypeOf<'dependent'>()

const action = defineRichTextAction(dependentFeature, {
  key: 'toggle-dependent',
  run: () => true,
})
const actionWithArgument = defineRichTextAction(dependentFeature, {
  key: 'set-dependent',
  run: (_editor, value: string) => value.length > 0,
  canRun: (_editor, value: string) => value.length > 0,
})
const editorFeature = defineRichTextEditorFeature(dependentFeature, {})

expectTypeOf(action.feature).toEqualTypeOf<typeof dependentFeature>()
expectTypeOf(action.key).toEqualTypeOf<'toggle-dependent'>()
expectTypeOf(actionWithArgument.run).parameter(1).toEqualTypeOf<string>()
expectTypeOf(editorFeature.feature).toEqualTypeOf<typeof dependentFeature>()

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

const baseServerFeature = defineRichTextServerFeature(baseFeature, { htmlPolicy: {} })
const serverPreset = defineRichTextServerPreset(preset, [baseServerFeature])

// @ts-expect-error Defined server preset implementations are immutable.
serverPreset.serverFeatures.push(baseServerFeature)

expectTypeOf(createImageServerFeature).parameter(0).toEqualTypeOf<RichTextImageServerOptions>()

const imageServerFeature = createImageServerFeature({
  isAllowedSrc: () => true,
})

expectTypeOf(imageServerFeature.feature).toEqualTypeOf<typeof imageFeature>()
expectTypeOf(createAllRichTextEditorPreset)
  .parameter(0)
  .toEqualTypeOf<AllRichTextEditorPresetOptions>()
expectTypeOf(createAllRichTextServerPreset)
  .parameter(0)
  .toEqualTypeOf<AllRichTextServerPresetOptions>()
expectTypeOf<ReturnType<typeof createAllRichTextEditorPreset>['key']>().toEqualTypeOf<'all'>()
expectTypeOf<ReturnType<typeof createAllRichTextServerPreset>['key']>().toEqualTypeOf<'all'>()
expectTypeOf(compactRichTextEditorPreset.key).toEqualTypeOf<'compact'>()
expectTypeOf(compactRichTextServerPreset.key).toEqualTypeOf<'compact'>()
