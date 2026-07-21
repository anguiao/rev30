import { validateRichTextFeatureImplementations, type RichTextFeature } from '../../core/feature'
import type { RichTextPreset } from '../../core/preset'
import type { RichTextEditorFeature } from '../../editor/feature'
import type { Component } from 'vue'
import {
  getRichTextQuickbarControlFeature,
  getRichTextQuickbarControlKey,
  type RichTextQuickbarConfig,
  type RichTextQuickbarControl,
} from '../quickbar'
import { getRichTextSlashCommandFeature, type RichTextSlashCommandConfig } from '../slash-command'
import type { RichTextStatusBarConfig, RichTextStatusBarComponentItem } from '../status-bar'
import {
  getRichTextToolbarControlFeature,
  type RichTextToolbarConfig,
  type RichTextToolbarControlConfig,
} from '../toolbar'

export interface RichTextEditorPreset<
  Preset extends RichTextPreset = RichTextPreset,
  EditorFeatures extends readonly RichTextEditorFeature[] = readonly RichTextEditorFeature[],
> extends RichTextPreset<Preset['key'], Preset['features']> {
  readonly editorFeatures: EditorFeatures
  readonly toolbar?: RichTextToolbarConfig
  readonly statusBar?: RichTextStatusBarConfig
  readonly quickbar?: RichTextQuickbarConfig
  readonly slashCommand?: RichTextSlashCommandConfig
  readonly host?: Component
}

function hasEditorFeature(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  feature: RichTextFeature,
) {
  return (
    preset.features.includes(feature) &&
    editorFeatures.some((editorFeature) => editorFeature.feature === feature)
  )
}

function assertEditorFeature(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  feature: RichTextFeature,
  surface: string,
) {
  if (!hasEditorFeature(preset, editorFeatures, feature)) {
    throw new Error(
      `Rich text preset "${preset.key}" has ${surface} for unknown feature "${feature.key}"`,
    )
  }
}

function validateToolbarControl(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  control: RichTextToolbarControlConfig,
) {
  const feature = getRichTextToolbarControlFeature(control)

  assertEditorFeature(preset, editorFeatures, feature, 'a toolbar control')
}

function validateStatusBarItem(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  item: RichTextStatusBarComponentItem,
) {
  assertEditorFeature(preset, editorFeatures, item.feature, 'a status bar item')
}

function validateQuickbarControl(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  control: RichTextQuickbarControl,
) {
  assertEditorFeature(
    preset,
    editorFeatures,
    getRichTextQuickbarControlFeature(control),
    'a quickbar control',
  )
}

function validateQuickbar(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  quickbar: RichTextQuickbarConfig,
) {
  const controlKeys = new Set<string>()

  for (const control of [...(quickbar.text?.primary ?? []), ...(quickbar.text?.more ?? [])]) {
    const key = getRichTextQuickbarControlKey(control)

    if (controlKeys.has(key)) {
      throw new Error(`Rich text preset "${preset.key}" has a duplicate quickbar control: "${key}"`)
    }

    controlKeys.add(key)
    validateQuickbarControl(preset, editorFeatures, control)
  }

  const featureKeys = new Set<string>()
  const features = new Set<RichTextFeature>()

  for (const featureQuickbar of quickbar.features) {
    if (featureKeys.has(featureQuickbar.key)) {
      throw new Error(
        `Rich text preset "${preset.key}" has a duplicate feature quickbar key: "${featureQuickbar.key}"`,
      )
    }

    if (features.has(featureQuickbar.feature)) {
      throw new Error(
        `Rich text preset "${preset.key}" has a duplicate feature quickbar: "${featureQuickbar.feature.key}"`,
      )
    }

    featureKeys.add(featureQuickbar.key)
    features.add(featureQuickbar.feature)
    assertEditorFeature(preset, editorFeatures, featureQuickbar.feature, 'a feature quickbar')
  }
}

function validateSlashCommand(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  slashCommand: RichTextSlashCommandConfig,
) {
  const hasSlashCommandFeature = preset.features.some((feature) => feature.key === 'slash-command')
  const hasSlashCommandEditorFeature = editorFeatures.some(
    ({ feature }) => feature.key === 'slash-command',
  )

  if (!hasSlashCommandFeature || !hasSlashCommandEditorFeature) {
    throw new Error(
      `Rich text preset "${preset.key}" has slash commands without the "slash-command" editor feature`,
    )
  }

  for (const group of slashCommand.groups) {
    for (const command of group.commands) {
      assertEditorFeature(
        preset,
        editorFeatures,
        getRichTextSlashCommandFeature(command),
        'a slash command',
      )
    }
  }
}

export function defineRichTextEditorPreset<
  const Preset extends RichTextPreset,
  const EditorFeatures extends readonly RichTextEditorFeature<Preset['features'][number]>[],
>(
  preset: Preset,
  options: {
    readonly editorFeatures: EditorFeatures
    readonly toolbar?: RichTextToolbarConfig
    readonly statusBar?: RichTextStatusBarConfig
    readonly quickbar?: RichTextQuickbarConfig
    readonly slashCommand?: RichTextSlashCommandConfig
    readonly host?: Component
  },
): RichTextEditorPreset<Preset, ReadonlyArray<EditorFeatures[number]>> {
  const editorFeatures = Object.freeze([...options.editorFeatures])

  validateRichTextFeatureImplementations(preset, 'editor', editorFeatures)

  if (options.toolbar) {
    for (const group of options.toolbar.groups) {
      for (const control of group.controls) {
        validateToolbarControl(preset, editorFeatures, control)
      }
    }
  }

  if (options.statusBar) {
    for (const item of [...options.statusBar.start, ...options.statusBar.end]) {
      validateStatusBarItem(preset, editorFeatures, item)
    }
  }

  if (options.quickbar) {
    validateQuickbar(preset, editorFeatures, options.quickbar)
  }

  if (options.slashCommand) {
    validateSlashCommand(preset, editorFeatures, options.slashCommand)
  }

  return Object.freeze({
    key: preset.key,
    features: preset.features,
    editorFeatures,
    ...(options.toolbar ? { toolbar: options.toolbar } : {}),
    ...(options.statusBar ? { statusBar: options.statusBar } : {}),
    ...(options.quickbar ? { quickbar: options.quickbar } : {}),
    ...(options.slashCommand ? { slashCommand: options.slashCommand } : {}),
    ...(options.host ? { host: options.host } : {}),
  })
}
