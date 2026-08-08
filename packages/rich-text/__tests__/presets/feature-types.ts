import type { CommandProps } from '@tiptap/core'
import { expectTypeOf } from 'vitest'
import { defineRichTextFeature } from '../../src/core/feature'
import { defineRichTextPreset } from '../../src/core/preset'
import { defineRichTextAction, defineRichTextActionItem } from '../../src/client/editor/action'
import { defineRichTextEditorFeature } from '../../src/client/editor/feature'
import {
  createImageServerFeature,
  type RichTextImageServerOptions,
} from '../../src/features/image/server/feature'
import { imageFeature } from '../../src/features/image/core/feature'
import { defineRichTextServerFeature } from '../../src/server/feature'
import {
  createAllRichTextServerPreset,
  type AllRichTextServerPresetOptions,
} from '../../src/server/presets/all'
import { compactRichTextServerPreset } from '../../src/server/presets/compact'
import {
  createStandardRichTextServerPreset,
  type StandardRichTextServerPresetOptions,
} from '../../src/server/presets/standard'
import { defineRichTextServerPreset, type RichTextServerPreset } from '../../src/server/preset'
import {
  createAllRichTextEditorPreset,
  type AllRichTextEditorPresetOptions,
} from '../../src/client/vue/presets/all'
import { compactRichTextEditorPreset } from '../../src/client/vue/presets/compact'
import {
  createStandardRichTextEditorPreset,
  type StandardRichTextEditorPresetOptions,
} from '../../src/client/vue/presets/standard'
import { defineRichTextEditorPreset, type RichTextEditorPreset } from '../../src/client/vue/preset'
import { richTextSlashCommand } from '../../src/client/vue/slash-menu'

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
  command: () => true,
})
const actionWithArgument = defineRichTextAction(dependentFeature, {
  key: 'set-dependent',
  command: (_props, value: string) => value.length > 0,
})
const editorFeature = defineRichTextEditorFeature(dependentFeature, {})

expectTypeOf(action.feature).toEqualTypeOf<typeof dependentFeature>()
expectTypeOf(action.key).toEqualTypeOf<'toggle-dependent'>()
expectTypeOf(action.command).parameter(0).toEqualTypeOf<CommandProps>()
expectTypeOf(action.command).returns.toEqualTypeOf<boolean>()
expectTypeOf(actionWithArgument.command).parameter(0).toEqualTypeOf<CommandProps>()
expectTypeOf(actionWithArgument.command).parameter(1).toEqualTypeOf<string>()
expectTypeOf(editorFeature.feature).toEqualTypeOf<typeof dependentFeature>()

const actionWithArgumentItem = defineRichTextActionItem(actionWithArgument, {
  label: '设置依赖',
  icon: 'i-[lucide--circle]',
})

// @ts-expect-error Parameterized actions require a custom slash command runner.
richTextSlashCommand(actionWithArgumentItem)
richTextSlashCommand(actionWithArgumentItem, () => {})

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
expectTypeOf(createStandardRichTextEditorPreset)
  .parameter(0)
  .toEqualTypeOf<StandardRichTextEditorPresetOptions>()
expectTypeOf(createStandardRichTextServerPreset)
  .parameter(0)
  .toEqualTypeOf<StandardRichTextServerPresetOptions>()
expectTypeOf<ReturnType<typeof createAllRichTextEditorPreset>['key']>().toEqualTypeOf<'all'>()
expectTypeOf<ReturnType<typeof createAllRichTextServerPreset>['key']>().toEqualTypeOf<'all'>()
expectTypeOf<
  ReturnType<typeof createStandardRichTextEditorPreset>
>().toEqualTypeOf<RichTextEditorPreset>()
expectTypeOf<
  ReturnType<typeof createStandardRichTextServerPreset>
>().toEqualTypeOf<RichTextServerPreset>()
expectTypeOf(compactRichTextEditorPreset.key).toEqualTypeOf<'compact'>()
expectTypeOf(compactRichTextServerPreset.key).toEqualTypeOf<'compact'>()

// @ts-expect-error Standard editor presets require an image upload strategy.
createStandardRichTextEditorPreset({})

// @ts-expect-error Standard server presets require an image source strategy.
createStandardRichTextServerPreset({})
